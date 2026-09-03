import * as THREE from "three";
import GpuScene, {
  GpuTextureType,
  type GpuMaterial,
  type GpuLight,
  type GpuQuad,
  type GpuBox,
  type GpuSphere,
  type GpuTriangle,
  type GpuTexture,
} from "./GpuScene";
import { PtTextureType, type PtTexture } from "./PtTexture";
import { PtInvalidationLevel } from "./PtInvalidation";
import PtScene, {
  getMaterialMetadata,
  sphereRadius,
  type PtPreviewMaterial,
} from "./PtScene";
import { buildTriangleBvh } from "./TriangleBvh";
import { buildSphereBvh } from "./SphereBvh";
import { compileGpuMaterial } from "./MaterialCompiler";

export const MAX_WEBGL_IMAGE_TEXTURES = 4;

export default class SceneCompiler {
  public compile(scene: PtScene): GpuScene {
    const { materials, textures, imageTextures } = this.compileMaterialResources(scene);
    const triangles = this.compileTriangles(scene);
    const spheres = this.compileSpheres(scene);
    return new GpuScene(
      spheres,
      buildSphereBvh(spheres),
      this.compileQuads(scene),
      this.compileBoxes(scene),
      triangles,
      buildTriangleBvh(triangles),
      materials,
      textures,
      imageTextures,
      this.compileLights(scene)
    );
  }

  public update(gpuScene: GpuScene, scene: PtScene, level: PtInvalidationLevel) {
    if (level === PtInvalidationLevel.Material) {
      const { materials, textures, imageTextures } = this.compileMaterialResources(scene);
      gpuScene.updateMaterials(materials, textures, imageTextures);
      gpuScene.updateLights(this.compileLights(scene));
      return;
    }
    if (level >= PtInvalidationLevel.Geometry) {
      const spheres = this.compileSpheres(scene);
      gpuScene.updateSpheres(spheres, buildSphereBvh(spheres));
      gpuScene.updateQuads(this.compileQuads(scene));
      gpuScene.updateBoxes(this.compileBoxes(scene));
      const triangles = this.compileTriangles(scene);
      gpuScene.updateTriangles(triangles, buildTriangleBvh(triangles));
      if (level === PtInvalidationLevel.Scene) {
        const { materials, textures, imageTextures } = this.compileMaterialResources(scene);
        gpuScene.updateMaterials(materials, textures, imageTextures);
      }
      gpuScene.updateLights(this.compileLights(scene));
    }
  }

  private compileSpheres(scene: PtScene): GpuSphere[] {
    return scene.getSphereMeshes().map((mesh) => ({
      position: mesh.position.clone(),
      radius: sphereRadius(mesh),
      materialId: getMaterialMetadata(mesh.material).materialId,
      uvMapping: mesh.userData.pathTracer.uvMapping,
    }));
  }

  private compileQuads(scene: PtScene): GpuQuad[] {
    return scene.getQuadMeshes().map((mesh) => {
      mesh.updateWorldMatrix(true, false);
      const q = mesh.localToWorld(new THREE.Vector3(-0.5, -0.5, 0));
      const u = mesh.localToWorld(new THREE.Vector3(0.5, -0.5, 0)).sub(q);
      const v = mesh.localToWorld(new THREE.Vector3(-0.5, 0.5, 0)).sub(q);
      return {
        q,
        u,
        v,
        normal: new THREE.Vector3().crossVectors(u, v).normalize(),
        materialId: getMaterialMetadata(mesh.material).materialId,
      };
    });
  }

  private compileBoxes(scene: PtScene): GpuBox[] {
    return scene.getBoxMeshes().map((mesh) => {
      mesh.updateWorldMatrix(true, false);
      const rotation = new THREE.Quaternion();
      const scale = new THREE.Vector3();
      mesh.matrixWorld.decompose(new THREE.Vector3(), rotation, scale);
      return {
        center: mesh.getWorldPosition(new THREE.Vector3()),
        halfSize: scale.set(Math.abs(scale.x), Math.abs(scale.y), Math.abs(scale.z)).multiplyScalar(0.5),
        axisX: new THREE.Vector3(1, 0, 0).applyQuaternion(rotation).normalize(),
        axisY: new THREE.Vector3(0, 1, 0).applyQuaternion(rotation).normalize(),
        axisZ: new THREE.Vector3(0, 0, 1).applyQuaternion(rotation).normalize(),
        materialId: getMaterialMetadata(mesh.material).materialId,
      };
    });
  }

  private compileTriangles(scene: PtScene): GpuTriangle[] {
    const triangles: GpuTriangle[] = [];
    scene.getTriangleMeshes().forEach((mesh) => {
      mesh.updateWorldMatrix(true, false);
      const positions = mesh.geometry.getAttribute("position");
      const normals = mesh.geometry.getAttribute("normal");
      const uvs = mesh.geometry.getAttribute("uv");
      const index = mesh.geometry.index;
      const normalMatrix = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
      const materialId = getMaterialMetadata(mesh.material).materialId;
      const vertexIndex = (offset: number) => index ? index.getX(offset) : offset;
      for (let offset = 0; offset < (index?.count ?? positions.count); offset += 3) {
        const ids = [vertexIndex(offset), vertexIndex(offset + 1), vertexIndex(offset + 2)];
        const readVector3 = (attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, id: number) =>
          new THREE.Vector3(attribute.getX(id), attribute.getY(id), attribute.getZ(id));
        const vertices = ids.map((id) => readVector3(positions, id).applyMatrix4(mesh.matrixWorld));
        const geometricNormal = new THREE.Vector3().crossVectors(
          vertices[1]!.clone().sub(vertices[0]), vertices[2]!.clone().sub(vertices[0])
        ).normalize();
        const vertexNormal = (id: number) => normals
          ? readVector3(normals, id).applyNormalMatrix(normalMatrix)
          : geometricNormal.clone();
        const vertexUv = (id: number) => uvs ? new THREE.Vector2(uvs.getX(id), uvs.getY(id)) : new THREE.Vector2();
        triangles.push({
          a: vertices[0]!, b: vertices[1]!, c: vertices[2]!,
          normalA: vertexNormal(ids[0]!), normalB: vertexNormal(ids[1]!), normalC: vertexNormal(ids[2]!),
          uvA: vertexUv(ids[0]!), uvB: vertexUv(ids[1]!), uvC: vertexUv(ids[2]!), materialId,
        });
      }
    });
    return triangles;
  }

  private compileMaterialResources(scene: PtScene): {
    materials: GpuMaterial[];
    textures: GpuTexture[];
    imageTextures: THREE.Texture[];
  } {
    const textures: GpuTexture[] = [];
    const imageTextures: THREE.Texture[] = [];
    const imageTextureIds = new Map<THREE.Texture, number>();
    const materials = scene.getMaterials().map((material, uniformIndex) => {
      const metadata = getMaterialMetadata(material);
      if (metadata.materialId !== uniformIndex) {
        throw new Error(`Material IDs must be contiguous: ${metadata.materialId}`);
      }
      const baseColorTextureId = textures.length;
      textures.push(this.compileTexture(
        metadata.materialDefinition.baseColor.texture,
        material,
        imageTextures,
        imageTextureIds
      ));
      const emissionTextureId = textures.length;
      textures.push(this.compileTexture(
        metadata.materialDefinition.emission.color.texture,
        material,
        imageTextures,
        imageTextureIds
      ));
      const metallicRoughnessTextureId = textures.length;
      textures.push(this.compileTexture(
        metadata.materialDefinition.metallicRoughnessTexture,
        material,
        imageTextures,
        imageTextureIds
      ));
      const transmissionTextureId = textures.length;
      textures.push(this.compileTexture(
        metadata.materialDefinition.transmission.texture,
        material,
        imageTextures,
        imageTextureIds
      ));
      const thicknessTextureId = textures.length;
      textures.push(this.compileTexture(
        metadata.materialDefinition.volume.thicknessTexture,
        material,
        imageTextures,
        imageTextureIds
      ));
      return compileGpuMaterial(
        metadata.materialDefinition,
        baseColorTextureId,
        emissionTextureId,
        metallicRoughnessTextureId,
        transmissionTextureId,
        thicknessTextureId
      );
    });
    if (imageTextures.length > MAX_WEBGL_IMAGE_TEXTURES) {
      throw new Error(
        `The WebGL backend currently supports ${MAX_WEBGL_IMAGE_TEXTURES} unique image textures, ` +
        `but this scene requires ${imageTextures.length}. Texture atlasing or array storage is required ` +
        `before this asset can be path traced without dropping material inputs.`
      );
    }
    return { materials, textures, imageTextures };
  }

  private compileTexture(
    texture: PtTexture,
    previewMaterial: PtPreviewMaterial,
    imageTextures: THREE.Texture[],
    imageTextureIds: Map<THREE.Texture, number>
  ): GpuTexture {
    if (texture.type === PtTextureType.Checker) {
      return {
        type: GpuTextureType.Checker,
        colorA: texture.colorA.clone(),
        colorB: texture.colorB.clone(),
        scale: texture.scale,
        turbulence: 0,
        imageId: -1,
      };
    }
    if (texture.type === PtTextureType.Image) {
      const runtimeTexture = texture.runtimeTexture ?? previewMaterial.map;
      if (!runtimeTexture) throw new Error("Image texture is not loaded by its preview material");
      let imageId = imageTextureIds.get(runtimeTexture);
      if (imageId === undefined) {
        imageId = imageTextures.length;
        imageTextures.push(runtimeTexture);
        imageTextureIds.set(runtimeTexture, imageId);
      }
      return {
        type: GpuTextureType.Image,
        colorA: texture.tint.clone(),
        colorB: new THREE.Color(),
        scale: 1,
        turbulence: 0,
        imageId,
      };
    }
    if (texture.type === PtTextureType.Perlin) {
      return {
        type: GpuTextureType.Perlin,
        colorA: texture.colorA.clone(),
        colorB: texture.colorB.clone(),
        scale: texture.scale,
        turbulence: texture.turbulence,
        imageId: -1,
      };
    }
    return {
      type: GpuTextureType.Constant,
      colorA: texture.color.clone(),
      colorB: new THREE.Color(),
      scale: 1,
      turbulence: 0,
      imageId: -1,
    };
  }

  private compileLights(scene: PtScene): GpuLight[] {
    const lights: GpuLight[] = [];
    scene.getSphereMeshes().forEach((mesh) => {
      const metadata = getMaterialMetadata(mesh.material);
      const definition = metadata.materialDefinition;
      if (definition.emission.strength <= 0) return;
      const radius = sphereRadius(mesh);
      lights.push({
        kind: 0,
        primitiveType: 0,
        primitiveIndex: mesh.userData.pathTracer.primitiveIndex,
        materialId: metadata.materialId,
        area: 4 * Math.PI * radius * radius,
        emissionTwoSided: definition.emission.twoSided,
        position: new THREE.Vector3(),
        direction: new THREE.Vector3(),
        color: new THREE.Color(),
        intensity: 0,
        angularDiameter: 0,
        innerConeCos: 1,
        outerConeCos: 1,
      });
    });
    scene.getQuadMeshes().forEach((mesh) => {
      const metadata = getMaterialMetadata(mesh.material);
      const definition = metadata.materialDefinition;
      if (definition.emission.strength <= 0) return;
      lights.push({
        kind: 1,
        primitiveType: 1,
        primitiveIndex: mesh.userData.pathTracer.primitiveIndex,
        materialId: metadata.materialId,
        area: Math.abs(mesh.scale.x * mesh.scale.y),
        emissionTwoSided: definition.emission.twoSided,
        position: new THREE.Vector3(),
        direction: new THREE.Vector3(),
        color: new THREE.Color(),
        intensity: 0,
        angularDiameter: 0,
        innerConeCos: 1,
        outerConeCos: 1,
      });
    });
    scene.getAnalyticLightNodes().forEach((node) => {
      const metadata = node.userData.pathTracer;
      if (!metadata.enabled || metadata.intensity <= 0) return;
      lights.push({
        kind: metadata.lightType === "point" ? 2 : metadata.lightType === "directional" ? 3 : 4,
        primitiveType: 0,
        primitiveIndex: 0,
        materialId: 0,
        area: 0,
        emissionTwoSided: true,
        position: node.getWorldPosition(new THREE.Vector3()),
        direction: node.getWorldDirection(new THREE.Vector3()).negate(),
        color: metadata.color.clone(),
        intensity: metadata.intensity,
        angularDiameter: metadata.angularDiameter,
        innerConeCos: Math.cos(THREE.MathUtils.degToRad(metadata.innerConeAngle)),
        outerConeCos: Math.cos(THREE.MathUtils.degToRad(metadata.outerConeAngle)),
      });
    });
    return lights;
  }
}
