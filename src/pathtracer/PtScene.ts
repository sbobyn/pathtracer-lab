import * as THREE from "three";
import PtSphere from "./PtSphere";
import PtMaterial, { PtMaterialType } from "./PtMaterial";
import { PtTextureType, type PtTexture } from "./PtTexture";

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
    };
  };
};

export default class PtScene {
  scene: THREE.Scene;
  intersectGroup: THREE.Group;
  private readonly previewMaterials = new Map<number, PtPreviewMaterial>();
  private readonly sphereGeometry = new THREE.SphereGeometry(1, 64, 64);
  dirLight: THREE.DirectionalLight;
  backgroundColorTop: THREE.Color;
  backgroundColorBottom: THREE.Color;

  camera: THREE.PerspectiveCamera;

  constructor(
    spheres: PtSphere[],
    materials: PtMaterial[],
    camera: THREE.PerspectiveCamera
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
      };

      this.intersectGroup.add(sphereMesh);
    }

    this.intersectGroup.updateMatrixWorld();
    this.scene.add(this.intersectGroup);
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

  public insertSphereMesh(mesh: PtSphereMesh, index = this.intersectGroup.children.length) {
    const clampedIndex = THREE.MathUtils.clamp(
      Math.trunc(index),
      0,
      this.intersectGroup.children.length
    );
    this.intersectGroup.add(mesh);
    const appendedIndex = this.intersectGroup.children.indexOf(mesh);
    this.intersectGroup.children.splice(appendedIndex, 1);
    this.intersectGroup.children.splice(clampedIndex, 0, mesh);
    this.reindexSpheres();
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
    };
    return mesh;
  }

  public removeSphereMesh(mesh: PtSphereMesh): number {
    const index = this.intersectGroup.children.indexOf(mesh);
    if (index < 0) return -1;
    this.intersectGroup.remove(mesh);
    this.reindexSpheres();
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

  private reindexSpheres() {
    this.intersectGroup.children.forEach((object, primitiveIndex) => {
      if (isPtSphereMesh(object)) {
        object.userData.pathTracer.primitiveIndex = primitiveIndex;
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

export function sphereRadius(mesh: PtSphereMesh): number {
  return mesh.geometry.parameters.radius * mesh.scale.x;
}

function createPreviewMaterial(
  material: PtMaterial,
  materialId: number
): PtPreviewMaterial {
  let previewMaterial: PtPreviewMaterial;
  const previewMap = createPreviewTexture(material.texture);
  if (material.type === 0) {
    previewMaterial = new THREE.MeshLambertMaterial({
      color: material.albedo,
      map: previewMap,
    });
  } else if (material.type === 1) {
    previewMaterial = new THREE.MeshStandardMaterial({
      color: material.albedo,
      map: previewMap,
      roughness: material.fuzz,
    });
  } else if (material.type === 2) {
    previewMaterial = new THREE.MeshPhysicalMaterial({
      color: material.albedo,
      map: previewMap,
      metalness: 0,
      roughness: 0,
      ior: material.ior,
      transmission: 1,
      opacity: 1,
      transparent: true,
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
  };
  return previewMaterial;
}

export function getMaterialMetadata(material: PtPreviewMaterial): {
  materialId: number;
  materialType: PtMaterialType;
  texture: PtTexture;
} {
  const metadata = material.userData.pathTracer;
  if (
    typeof metadata?.materialId !== "number" ||
    typeof metadata?.materialType !== "number" ||
    !metadata.texture
  ) {
    throw new TypeError("Material is missing path-tracing metadata");
  }
  return metadata;
}

function createPreviewTexture(texture: PtTexture): THREE.Texture | null {
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
