import * as THREE from "three";
import PtSphere from "./PtSphere";
import PtQuad from "./PtQuad";
import PtMaterial, { PtMaterialModel, PtMaterialType } from "./PtMaterial";
import { PtTextureType, texturePreviewColor, type PtTexture } from "./PtTexture";
import {
  createPointLightNode,
  createDirectionalLightNode,
  createSpotLightNode,
  isPtAnalyticLightNode,
  type PtAnalyticLightNode,
} from "./PtAnalyticLight";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";
import {
  buildEnvironmentImportanceDistribution,
  disposeEnvironmentImportanceDistribution,
  type EnvironmentImportanceDistribution,
} from "./EnvironmentImportanceDistribution";
import { loadStaticGltf } from "./StaticGltfLoader";
import { translateStaticGltfMaterial } from "./GltfMaterialTranslator";

export type PtPreviewMaterial =
  | THREE.MeshBasicMaterial
  | THREE.MeshLambertMaterial
  | THREE.MeshStandardMaterial
  | THREE.MeshPhysicalMaterial;

export type PtSphereMesh = THREE.Mesh<
  THREE.SphereGeometry,
  PtPreviewMaterial
> & {
  userData: {
    pathTracer: {
      objectId: string;
      objectName: string;
      primitiveIndex: number;
      primitiveType: "sphere";
      uvMapping: 0 | 1;
    };
  };
};

export type PtQuadMesh = THREE.Mesh<THREE.BufferGeometry, PtPreviewMaterial> & {
  userData: {
    pathTracer: {
      objectId: string;
      objectName: string;
      primitiveIndex: number;
      primitiveType: "quad";
    };
  };
};

export type PtTriangleMesh = THREE.Mesh<THREE.BufferGeometry, PtPreviewMaterial> & {
  userData: { pathTracer: { objectId: string; objectName: string; primitiveType: "triangleMesh" } };
};

export type PtTraceableMesh = PtSphereMesh | PtQuadMesh | PtTriangleMesh;
export type PtEditableObject = PtTraceableMesh | PtAnalyticLightNode;

export default class PtScene {
  scene: THREE.Scene;
  intersectGroup: THREE.Group;
  analyticLightGroup: THREE.Group;
  triangleMeshGroup: THREE.Group;
  private readonly previewMaterials = new Map<number, PtPreviewMaterial>();
  private readonly sphereGeometry = new THREE.SphereGeometry(1, 64, 64);
  dirLight: THREE.DirectionalLight;
  backgroundColorTop: THREE.Color;
  backgroundColorBottom: THREE.Color;
  environmentSource = "";
  environmentLabel = "Gradient";
  environmentTexture: THREE.Texture | null = null;
  environmentDistribution: EnvironmentImportanceDistribution | null = null;
  environmentLoaded: Promise<THREE.Texture> | null = null;
  staticAssetsLoaded: Promise<void> | null = null;
  staticAssetError: Error | null = null;

  camera: THREE.PerspectiveCamera;

  constructor(
    spheres: PtSphere[],
    materials: PtMaterial[],
    camera: THREE.PerspectiveCamera,
    quads: PtQuad[] = []
  ) {
    this.camera = camera;

    this.scene = new THREE.Scene();

    this.backgroundColorTop = new THREE.Color(0.5, 0.7, 1); // Sky blue background
    this.backgroundColorBottom = new THREE.Color(1, 1, 1); // White ground
    this.scene.background = this.backgroundColorTop;

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    this.scene.add(ambientLight);

    this.dirLight = new THREE.DirectionalLight(this.backgroundColorTop, 1.0);
    this.dirLight.position.set(0, 5, 0);
    this.scene.add(this.dirLight);

    this.intersectGroup = new THREE.Group();
    this.analyticLightGroup = new THREE.Group();
    this.triangleMeshGroup = new THREE.Group();
    this.triangleMeshGroup.name = "Static triangle meshes";
    this.analyticLightGroup.name = "Analytic lights";

    materials.forEach((material, materialId) => {
      this.previewMaterials.set(
        materialId,
        createPreviewMaterial(material, materialId)
      );
    });

    for (let i = 0; i < spheres.length; i++) {
      const sphere = spheres[i];
      const materialDef = materials[sphere.materialId];
      const material = this.previewMaterials.get(sphere.materialId);
      if (!material || !materialDef) {
        throw new RangeError(
          `Unknown material ${sphere.materialId} for sphere ${i}`
        );
      }

      const sphereMesh = new THREE.Mesh(
        this.sphereGeometry,
        material
      ) as PtSphereMesh;
      sphereMesh.position.copy(sphere.position);
      sphereMesh.scale.setScalar(sphere.radius);

      sphereMesh.userData.pathTracer = {
        objectId: THREE.MathUtils.generateUUID(),
        objectName: `Sphere ${i}`,
        primitiveIndex: i,
        primitiveType: "sphere",
        uvMapping: sphere.uvMapping,
      };

      this.intersectGroup.add(sphereMesh);
    }

    for (let i = 0; i < quads.length; i++) {
      const quad = quads[i];
      const material = this.previewMaterials.get(quad.materialId);
      if (!material) throw new RangeError(`Unknown material ${quad.materialId} for quad ${i}`);
      material.side = THREE.DoubleSide;
      const quadMesh = new THREE.Mesh(createQuadGeometry(), material) as PtQuadMesh;
      applyQuadTransform(quadMesh, quad);
      quadMesh.userData.pathTracer = {
        objectId: THREE.MathUtils.generateUUID(),
        objectName: `Quad ${i}`,
        primitiveIndex: i,
        primitiveType: "quad",
      };
      this.intersectGroup.add(quadMesh);
    }

    this.intersectGroup.updateMatrixWorld();
    this.scene.add(this.intersectGroup);
    this.scene.add(this.analyticLightGroup);
    this.scene.add(this.triangleMeshGroup);
  }

  public getSphereMeshes(): PtSphereMesh[] {
    const spheres: PtSphereMesh[] = [];
    this.intersectGroup.traverse((object) => {
      if (isPtSphereMesh(object)) spheres.push(object);
    });
    return spheres.sort(
      (a, b) =>
        a.userData.pathTracer.primitiveIndex -
        b.userData.pathTracer.primitiveIndex
    );
  }

  public setEnvironmentMap(source: string, label: string) {
    this.environmentSource = source;
    this.environmentLabel = label;
    this.environmentTexture = null;
    if (this.environmentDistribution) {
      disposeEnvironmentImportanceDistribution(this.environmentDistribution);
      this.environmentDistribution = null;
    }
    if (!source) {
      this.environmentLoaded = null;
      return;
    }
    this.environmentLoaded = new Promise((resolve, reject) => {
      new RGBELoader().load(source, (texture) => {
        texture.mapping = THREE.EquirectangularReflectionMapping;
        texture.wrapS = THREE.RepeatWrapping;
        this.environmentTexture = texture;
        this.environmentDistribution = buildEnvironmentImportanceDistribution(texture);
        this.scene.background = texture;
        this.scene.environment = texture;
        resolve(texture);
      }, undefined, reject);
    });
  }

  public getQuadMeshes(): PtQuadMesh[] {
    const quads: PtQuadMesh[] = [];
    this.intersectGroup.traverse((object) => {
      if (isPtQuadMesh(object)) quads.push(object);
    });
    return quads.sort((a, b) => a.userData.pathTracer.primitiveIndex - b.userData.pathTracer.primitiveIndex);
  }

  public getAnalyticLightNodes(): PtAnalyticLightNode[] {
    return this.analyticLightGroup.children.filter(isPtAnalyticLightNode);
  }

  public getTriangleMeshes(): PtTriangleMesh[] {
    return this.triangleMeshGroup.children.filter(isPtTriangleMesh);
  }

  public addTriangleMesh(
    geometry: THREE.BufferGeometry,
    materialId: number,
    objectName: string
  ): PtTriangleMesh {
    const mesh = new THREE.Mesh(geometry, this.getMaterial(materialId)) as PtTriangleMesh;
    mesh.userData.pathTracer = { objectId: THREE.MathUtils.generateUUID(), objectName, primitiveType: "triangleMesh" };
    this.triangleMeshGroup.add(mesh);
    this.triangleMeshGroup.updateMatrixWorld(true);
    return mesh;
  }

  public loadStaticGltf(source: string, fallbackMaterialId: number, label: string) {
    this.staticAssetError = null;
    this.staticAssetsLoaded = loadStaticGltf(source).then((primitives) => {
      const materialIds = new Map<string, number>();
      primitives.forEach((primitive, index) => {
        let materialId = materialIds.get(primitive.material.uuid);
        if (materialId === undefined) {
          try {
            materialId = this.addMaterial(translateStaticGltfMaterial(primitive.material));
          } catch (error) {
            console.warn(`Using fallback material for ${primitive.name}`, error);
            materialId = fallbackMaterialId;
          }
          materialIds.set(primitive.material.uuid, materialId);
        }
        this.addTriangleMesh(
          primitive.geometry,
          materialId,
          primitives.length === 1 ? label : `${label} · ${primitive.name || index + 1}`
        );
      });
    }).catch((error: unknown) => {
      this.staticAssetError = error instanceof Error ? error : new Error(String(error));
      throw this.staticAssetError;
    });
    return this.staticAssetsLoaded;
  }

  public createPointLightNode(position: THREE.Vector3, objectName: string) {
    return createPointLightNode(position, objectName);
  }

  public createDirectionalLightNode(position: THREE.Vector3, objectName: string) {
    return createDirectionalLightNode(position, objectName);
  }

  public createSpotLightNode(position: THREE.Vector3, objectName: string) {
    return createSpotLightNode(position, objectName);
  }

  public insertAnalyticLightNode(
    node: PtAnalyticLightNode,
    index = this.analyticLightGroup.children.length
  ) {
    const clampedIndex = THREE.MathUtils.clamp(
      Math.trunc(index),
      0,
      this.analyticLightGroup.children.length
    );
    this.analyticLightGroup.add(node);
    const appendedIndex = this.analyticLightGroup.children.indexOf(node);
    this.analyticLightGroup.children.splice(appendedIndex, 1);
    this.analyticLightGroup.children.splice(clampedIndex, 0, node);
    this.analyticLightGroup.updateMatrixWorld();
  }

  public removeAnalyticLightNode(node: PtAnalyticLightNode) {
    const index = this.analyticLightGroup.children.indexOf(node);
    if (index < 0) return -1;
    this.analyticLightGroup.remove(node);
    this.analyticLightGroup.updateMatrixWorld();
    return index;
  }

  public insertSphereMesh(mesh: PtSphereMesh, index = this.intersectGroup.children.length) {
    this.insertTraceableMesh(mesh, index);
  }

  public insertQuadMesh(mesh: PtQuadMesh, index = this.intersectGroup.children.length) {
    this.insertTraceableMesh(mesh, index);
  }

  private insertTraceableMesh(mesh: PtTraceableMesh, index: number) {
    const clampedIndex = THREE.MathUtils.clamp(
      Math.trunc(index),
      0,
      this.intersectGroup.children.length
    );
    this.intersectGroup.add(mesh);
    const appendedIndex = this.intersectGroup.children.indexOf(mesh);
    this.intersectGroup.children.splice(appendedIndex, 1);
    this.intersectGroup.children.splice(clampedIndex, 0, mesh);
    this.reindexPrimitives();
    this.intersectGroup.updateMatrixWorld();
  }

  public createSphereMesh(
    position: THREE.Vector3,
    radius: number,
    materialId: number,
    objectName: string
  ): PtSphereMesh {
    const material = this.getMaterial(materialId);
    const mesh = new THREE.Mesh(this.sphereGeometry, material) as PtSphereMesh;
    mesh.position.copy(position);
    mesh.scale.setScalar(radius);
    mesh.userData.pathTracer = {
      objectId: THREE.MathUtils.generateUUID(),
      objectName,
      primitiveIndex: this.getSphereMeshes().length,
      primitiveType: "sphere",
      uvMapping: 0,
    };
    return mesh;
  }

  public createQuadMesh(
    position: THREE.Vector3,
    rotation: THREE.Quaternion,
    width: number,
    height: number,
    materialId: number,
    objectName: string
  ): PtQuadMesh {
    const material = this.getMaterial(materialId);
    material.side = THREE.DoubleSide;
    const mesh = new THREE.Mesh(createQuadGeometry(), material) as PtQuadMesh;
    mesh.position.copy(position);
    mesh.quaternion.copy(rotation);
    mesh.scale.set(width, height, 1);
    mesh.userData.pathTracer = {
      objectId: THREE.MathUtils.generateUUID(),
      objectName,
      primitiveIndex: this.getQuadMeshes().length,
      primitiveType: "quad",
    };
    return mesh;
  }

  public removeSphereMesh(mesh: PtSphereMesh): number {
    const index = this.intersectGroup.children.indexOf(mesh);
    if (index < 0) return -1;
    this.intersectGroup.remove(mesh);
    this.reindexPrimitives();
    this.intersectGroup.updateMatrixWorld();
    return index;
  }

  public removeQuadMesh(mesh: PtQuadMesh): number {
    const index = this.intersectGroup.children.indexOf(mesh);
    if (index < 0) return -1;
    this.intersectGroup.remove(mesh);
    this.reindexPrimitives();
    this.intersectGroup.updateMatrixWorld();
    return index;
  }

  public getMaterials(): PtPreviewMaterial[] {
    return [...this.previewMaterials.entries()]
      .sort(([a], [b]) => a - b)
      .map(([, material]) => material);
  }

  public getMaterial(materialId: number): PtPreviewMaterial {
    const material = this.previewMaterials.get(materialId);
    if (!material) throw new RangeError(`Unknown material: ${materialId}`);
    return material;
  }

  public addMaterial(material: PtMaterial): number {
    const materialId = this.previewMaterials.size;
    this.previewMaterials.set(materialId, createPreviewMaterial(material, materialId));
    return materialId;
  }

  public setMaterialTexture(materialId: number, texture: PtTexture) {
    const material = this.getMaterial(materialId);
    const metadata = getMaterialMetadata(material);
    material.map?.dispose();
    material.map = createPreviewTexture(texture);
    material.color.copy(texture.type === PtTextureType.Constant ? texture.color : new THREE.Color(0xffffff));
    metadata.texture = texture;
    const input = metadata.materialDefinition.model === PtMaterialType.Emissive
      ? metadata.materialDefinition.emission.color
      : metadata.materialDefinition.baseColor;
    input.texture = texture;
    input.factor.set(0xffffff);
    material.needsUpdate = true;
  }

  public setMaterialTextureSlot(
    materialId: number,
    slot: "baseColor" | "metallicRoughness" | "emission",
    texture: PtTexture
  ) {
    const material = this.getMaterial(materialId);
    const definition = getMaterialMetadata(material).materialDefinition;
    if (slot === "baseColor") {
      material.map?.dispose();
      material.map = createPreviewTexture(texture);
      definition.baseColor.texture = texture;
    } else if (slot === "metallicRoughness") {
      const dataMap = createPreviewTexture(texture, false);
      if (material instanceof THREE.MeshStandardMaterial) {
        material.metalnessMap?.dispose();
        material.metalnessMap = dataMap;
        material.roughnessMap = dataMap;
      }
      definition.metallicRoughnessTexture = texture;
    } else {
      if (material instanceof THREE.MeshStandardMaterial) {
        material.emissiveMap?.dispose();
        material.emissiveMap = createPreviewTexture(texture);
      }
      definition.emission.color.texture = texture;
    }
    material.needsUpdate = true;
  }

  public setMaterialTextureSlotEnabled(
    materialId: number,
    slot: "baseColor" | "metallicRoughness" | "emission",
    enabled: boolean
  ) {
    const material = this.getMaterial(materialId);
    const definition = getMaterialMetadata(material).materialDefinition;
    if (slot === "baseColor") {
      definition.baseColor.textureEnabled = enabled;
      material.map = enabled ? createPreviewTexture(definition.baseColor.texture) : null;
      material.color.copy(definition.baseColor.factor);
    } else if (slot === "metallicRoughness") {
      definition.metallicRoughnessTextureEnabled = enabled;
      if (material instanceof THREE.MeshStandardMaterial) {
        const map = enabled
          ? createPreviewTexture(definition.metallicRoughnessTexture, false)
          : null;
        material.metalnessMap = map;
        material.roughnessMap = map;
      }
    } else {
      definition.emission.color.textureEnabled = enabled;
      if (material instanceof THREE.MeshStandardMaterial) {
        material.emissiveMap = enabled
          ? createPreviewTexture(definition.emission.color.texture)
          : null;
        material.emissive.copy(
          enabled ? definition.emission.color.factor : new THREE.Color(0x000000)
        );
      }
    }
    material.needsUpdate = true;
  }

  private reindexPrimitives() {
    let sphereIndex = 0;
    let quadIndex = 0;
    this.intersectGroup.children.forEach((object) => {
      if (isPtSphereMesh(object)) {
        object.userData.pathTracer.primitiveIndex = sphereIndex++;
      } else if (isPtQuadMesh(object)) {
        object.userData.pathTracer.primitiveIndex = quadIndex++;
      }
    });
  }
}

export function isPtSphereMesh(object: THREE.Object3D): object is PtSphereMesh {
  return (
    object instanceof THREE.Mesh &&
    object.userData.pathTracer?.primitiveType === "sphere"
  );
}

export function isPtQuadMesh(object: THREE.Object3D): object is PtQuadMesh {
  return object instanceof THREE.Mesh && object.userData.pathTracer?.primitiveType === "quad";
}

export function isPtTriangleMesh(object: THREE.Object3D): object is PtTriangleMesh {
  return object instanceof THREE.Mesh && object.userData.pathTracer?.primitiveType === "triangleMesh";
}

export function sphereRadius(mesh: PtSphereMesh): number {
  return mesh.geometry.parameters.radius * mesh.scale.x;
}

function createPreviewMaterial(
  material: PtMaterial,
  materialId: number
): PtPreviewMaterial {
  let previewMaterial: PtPreviewMaterial;
  const previewMap = material.definition.baseColor.textureEnabled
    ? createPreviewTexture(material.texture) : null;
  const previewInput = material.definition.model === PtMaterialType.Emissive
    ? material.definition.emission.color
    : material.definition.baseColor;
  const previewColor = previewMap
    ? previewInput.factor
    : texturePreviewColor(previewInput.texture).clone().multiply(previewInput.factor);
  if (material.type === 0) {
    previewMaterial = new THREE.MeshLambertMaterial({
      color: previewColor,
      map: previewMap,
    });
  } else if (material.type === 1) {
    previewMaterial = new THREE.MeshStandardMaterial({
      color: previewColor,
      map: previewMap,
      roughness: material.fuzz,
    });
  } else if (material.type === 2) {
    previewMaterial = new THREE.MeshPhysicalMaterial({
      color: previewColor,
      map: previewMap,
      metalness: 0,
      roughness: 0,
      ior: material.ior,
      transmission: 1,
      opacity: 1,
      transparent: true,
    });
  } else if (material.type === PtMaterialModel.PrincipledMetallicRoughness) {
    const dataMap = material.definition.metallicRoughnessTextureEnabled
      ? createPreviewTexture(material.definition.metallicRoughnessTexture, false)
      : null;
    previewMaterial = new THREE.MeshStandardMaterial({
      color: previewColor,
      map: previewMap,
      metalness: material.definition.metallic,
      roughness: material.definition.roughness,
      metalnessMap: dataMap,
      roughnessMap: dataMap,
      emissive: material.definition.emission.color.textureEnabled
        ? material.definition.emission.color.factor
        : new THREE.Color(0x000000),
      emissiveMap: material.definition.emission.color.textureEnabled
        ? createPreviewTexture(material.definition.emission.color.texture) : null,
      emissiveIntensity: material.definition.emission.strength,
    });
  } else if (material.type === PtMaterialType.Emissive) {
    previewMaterial = new THREE.MeshBasicMaterial({
      color: previewColor,
      map: previewMap,
    });
  } else {
    console.warn(
      `Unknown material type ${material.type} for material ${materialId}`
    );
    previewMaterial = new THREE.MeshBasicMaterial({ color: 0xff00ff });
  }
  previewMaterial.userData.pathTracer = {
    materialId,
    materialType: material.type,
    texture: material.texture,
    emissionStrength: material.emissionStrength,
    emissionTwoSided: material.emissionTwoSided,
    materialDefinition: material.definition,
  };
  return previewMaterial;
}

function createQuadGeometry() {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute([
    -0.5, -0.5, 0,
     0.5, -0.5, 0,
    -0.5,  0.5, 0,
     0.5,  0.5, 0,
  ], 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 1, 1], 2));
  geometry.setIndex([0, 1, 2, 2, 1, 3]);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  return geometry;
}

function applyQuadTransform(mesh: PtQuadMesh, quad: PtQuad) {
  const width = quad.u.length();
  const height = quad.v.length();
  if (width === 0 || height === 0) throw new RangeError("Quad edges must be non-zero");
  const xAxis = quad.u.clone().normalize();
  const yAxis = quad.v.clone().normalize();
  const zAxis = new THREE.Vector3().crossVectors(xAxis, yAxis).normalize();
  const basis = new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis);
  mesh.position.copy(quad.q).addScaledVector(quad.u, 0.5).addScaledVector(quad.v, 0.5);
  mesh.quaternion.setFromRotationMatrix(basis);
  mesh.scale.set(width, height, 1);
}

export function getMaterialMetadata(material: PtPreviewMaterial): {
  materialId: number;
  materialType: PtMaterialModel;
  texture: PtTexture;
  emissionStrength: number;
  emissionTwoSided: boolean;
  materialDefinition: PtMaterial["definition"];
} {
  const metadata = material.userData.pathTracer;
  if (
    typeof metadata?.materialId !== "number" ||
    typeof metadata?.materialType !== "number" ||
    !metadata.texture ||
    typeof metadata.emissionStrength !== "number" ||
    typeof metadata.emissionTwoSided !== "boolean" ||
    !metadata.materialDefinition
  ) {
    throw new TypeError("Material is missing path-tracing metadata");
  }
  return metadata;
}

function createPreviewTexture(texture: PtTexture, colorTexture = true): THREE.Texture | null {
  if (texture.type === PtTextureType.Image) {
    if (texture.runtimeTexture) {
      const map = texture.runtimeTexture.clone();
      map.needsUpdate = true;
      map.userData.pathTracerLoaded = Promise.resolve();
      return map;
    }
    let markLoaded!: () => void;
    const loaded = new Promise<void>((resolve) => { markLoaded = resolve; });
    const map = new THREE.TextureLoader().load(texture.source, markLoaded);
    map.colorSpace = colorTexture ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    map.wrapS = THREE.RepeatWrapping;
    map.wrapT = THREE.ClampToEdgeWrapping;
    // Ray-generated sphere UVs jump from 1 to 0 at the longitude seam. Implicit
    // derivatives see that jump as a huge footprint and select a blurry mip,
    // so image textures use their full-resolution level until explicit LOD is available.
    map.generateMipmaps = false;
    map.minFilter = THREE.LinearFilter;
    map.userData.pathTracerLoaded = loaded;
    return map;
  }
  if (texture.type !== PtTextureType.Checker) return null;
  const colors = [texture.colorA, texture.colorB, texture.colorB, texture.colorA];
  const data = new Uint8Array(colors.flatMap((color) => {
    const hex = color.getHex(THREE.SRGBColorSpace);
    return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255, 255];
  }));
  const map = new THREE.DataTexture(data, 2, 2, THREE.RGBAFormat);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(texture.scale / 2, texture.scale / 2);
  map.needsUpdate = true;
  return map;
}
