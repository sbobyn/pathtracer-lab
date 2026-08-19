import * as THREE from "three";
import PtSphere from "./PtSphere";
import PtMaterial, { PtMaterialType } from "./PtMaterial";

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
      primitiveIndex: number;
      primitiveType: "sphere";
    };
  };
};

export interface PtSphereUniform {
  position: THREE.Vector3;
  radius: number;
  materialId: number;
}

export default class PtScene {
  scene: THREE.Scene;
  intersectGroup: THREE.Group;
  private readonly previewMaterials = new Map<number, PtPreviewMaterial>();
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

    const sphereGeometry = new THREE.SphereGeometry(1, 64, 64);

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
        sphereGeometry,
        material
      ) as PtSphereMesh;
      sphereMesh.position.copy(sphere.position);
      sphereMesh.scale.setScalar(sphere.radius);

      sphereMesh.userData.pathTracer = {
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

  public createSphereUniforms(): PtSphereUniform[] {
    return this.getSphereMeshes().map((mesh) => ({
      position: mesh.position,
      radius: sphereRadius(mesh),
      materialId: getMaterialMetadata(mesh.material).materialId,
    }));
  }

  public createMaterialUniforms(): PtMaterial[] {
    return [...this.previewMaterials.entries()]
      .sort(([a], [b]) => a - b)
      .map(([materialId, material], uniformIndex) => {
        const metadata = getMaterialMetadata(material);
        if (materialId !== metadata.materialId) {
          throw new Error(`Material metadata mismatch: ${materialId}`);
        }
        if (materialId !== uniformIndex) {
          throw new Error(`Material IDs must be contiguous: ${materialId}`);
        }
        return new PtMaterial(
          metadata.materialType,
          material.color,
          material instanceof THREE.MeshStandardMaterial
            ? material.roughness
            : 0,
          material instanceof THREE.MeshPhysicalMaterial ? material.ior : 0
        );
      });
  }

  public getMaterial(materialId: number): PtPreviewMaterial {
    const material = this.previewMaterials.get(materialId);
    if (!material) throw new RangeError(`Unknown material: ${materialId}`);
    return material;
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
  if (material.type === 0) {
    previewMaterial = new THREE.MeshLambertMaterial({ color: material.albedo });
  } else if (material.type === 1) {
    previewMaterial = new THREE.MeshStandardMaterial({
      color: material.albedo,
      roughness: material.fuzz,
    });
  } else if (material.type === 2) {
    previewMaterial = new THREE.MeshPhysicalMaterial({
      color: material.albedo,
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
  };
  return previewMaterial;
}

export function getMaterialMetadata(material: PtPreviewMaterial): {
  materialId: number;
  materialType: PtMaterialType;
} {
  const metadata = material.userData.pathTracer;
  if (
    typeof metadata?.materialId !== "number" ||
    typeof metadata?.materialType !== "number"
  ) {
    throw new TypeError("Material is missing path-tracing metadata");
  }
  return metadata;
}
