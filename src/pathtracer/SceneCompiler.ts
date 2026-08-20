import * as THREE from "three";
import GpuScene, {
  GpuTextureType,
  type GpuMaterial,
  type GpuQuad,
  type GpuSphere,
  type GpuTexture,
} from "./GpuScene";
import PtMaterial from "./PtMaterial";
import { PtTextureType, type PtTexture } from "./PtTexture";
import { PtInvalidationLevel } from "./PtInvalidation";
import PtScene, {
  getMaterialMetadata,
  sphereRadius,
  type PtPreviewMaterial,
} from "./PtScene";

export default class SceneCompiler {
  public compile(scene: PtScene): GpuScene {
    const { materials, textures, imageTextures } = this.compileMaterialResources(scene);
    return new GpuScene(
      this.compileSpheres(scene),
      this.compileQuads(scene),
      materials,
      textures,
      imageTextures
    );
  }

  public update(gpuScene: GpuScene, scene: PtScene, level: PtInvalidationLevel) {
    if (level === PtInvalidationLevel.Material) {
      const { materials, textures, imageTextures } = this.compileMaterialResources(scene);
      gpuScene.updateMaterials(materials, textures, imageTextures);
      return;
    }
    if (level >= PtInvalidationLevel.Geometry) {
      gpuScene.updateSpheres(this.compileSpheres(scene));
      gpuScene.updateQuads(this.compileQuads(scene));
      if (level === PtInvalidationLevel.Scene) {
        const { materials, textures, imageTextures } = this.compileMaterialResources(scene);
        gpuScene.updateMaterials(materials, textures, imageTextures);
      }
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
      const quad = mesh.userData.pathTracer.quad;
      return {
        q: quad.q.clone(),
        u: quad.u.clone(),
        v: quad.v.clone(),
        normal: new THREE.Vector3().crossVectors(quad.u, quad.v).normalize(),
        materialId: quad.materialId,
      };
    });
  }

  private compileMaterialResources(scene: PtScene): {
    materials: GpuMaterial[];
    textures: GpuTexture[];
    imageTextures: THREE.Texture[];
  } {
    const textures: GpuTexture[] = [];
    const imageTextures: THREE.Texture[] = [];
    const materials = scene.getMaterials().map((material, uniformIndex) => {
      const metadata = getMaterialMetadata(material);
      if (metadata.materialId !== uniformIndex) {
        throw new Error(`Material IDs must be contiguous: ${metadata.materialId}`);
      }
      const textureId = textures.length;
      textures.push(this.compileTexture(metadata.texture, material, imageTextures));
      return this.compileMaterial(material, metadata.materialType, textureId);
    });
    return { materials, textures, imageTextures };
  }

  private compileTexture(
    texture: PtTexture,
    previewMaterial: PtPreviewMaterial,
    imageTextures: THREE.Texture[]
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
      if (!previewMaterial.map) throw new Error("Image texture is not loaded by its preview material");
      const imageId = imageTextures.length;
      imageTextures.push(previewMaterial.map);
      return {
        type: GpuTextureType.Image,
        colorA: new THREE.Color(1, 0, 1),
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
      colorA: previewMaterial.color.clone(),
      colorB: new THREE.Color(),
      scale: 1,
      turbulence: 0,
      imageId: -1,
    };
  }

  private compileMaterial(
    material: PtPreviewMaterial,
    materialType: PtMaterial["type"],
    textureId: number
  ): GpuMaterial {
    return {
      type: materialType,
      textureId,
      fuzz: material instanceof THREE.MeshStandardMaterial ? material.roughness : 0,
      ior: material instanceof THREE.MeshPhysicalMaterial ? material.ior : 0,
    };
  }
}
