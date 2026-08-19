import * as THREE from "three";
import GpuScene, { type GpuSphere } from "./GpuScene";
import PtMaterial from "./PtMaterial";
import { PtInvalidationLevel } from "./PtInvalidation";
import PtScene, {
  getMaterialMetadata,
  sphereRadius,
  type PtPreviewMaterial,
} from "./PtScene";

export default class SceneCompiler {
  public compile(scene: PtScene): GpuScene {
    return new GpuScene(
      this.compileSpheres(scene),
      this.compileMaterials(scene)
    );
  }

  public update(gpuScene: GpuScene, scene: PtScene, level: PtInvalidationLevel) {
    if (level === PtInvalidationLevel.Material) {
      gpuScene.updateMaterials(this.compileMaterials(scene));
      return;
    }
    if (level >= PtInvalidationLevel.Geometry) {
      gpuScene.updateSpheres(this.compileSpheres(scene));
      if (level === PtInvalidationLevel.Scene) {
        gpuScene.updateMaterials(this.compileMaterials(scene));
      }
    }
  }

  private compileSpheres(scene: PtScene): GpuSphere[] {
    return scene.getSphereMeshes().map((mesh) => ({
      position: mesh.position.clone(),
      radius: sphereRadius(mesh),
      materialId: getMaterialMetadata(mesh.material).materialId,
    }));
  }

  private compileMaterials(scene: PtScene): PtMaterial[] {
    return scene.getMaterials().map((material, uniformIndex) => {
      const metadata = getMaterialMetadata(material);
      if (metadata.materialId !== uniformIndex) {
        throw new Error(`Material IDs must be contiguous: ${metadata.materialId}`);
      }
      return this.compileMaterial(material, metadata.materialType);
    });
  }

  private compileMaterial(
    material: PtPreviewMaterial,
    materialType: PtMaterial["type"]
  ): PtMaterial {
    return new PtMaterial(
      materialType,
      material.color.clone(),
      material instanceof THREE.MeshStandardMaterial ? material.roughness : 0,
      material instanceof THREE.MeshPhysicalMaterial ? material.ior : 0
    );
  }
}
