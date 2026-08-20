import * as THREE from "three";
import GpuScene, {
  GpuTextureType,
  type GpuMaterial,
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
    const { materials, textures } = this.compileMaterialResources(scene);
    return new GpuScene(
      this.compileSpheres(scene),
      materials,
      textures
    );
  }

  public update(gpuScene: GpuScene, scene: PtScene, level: PtInvalidationLevel) {
    if (level === PtInvalidationLevel.Material) {
      const { materials, textures } = this.compileMaterialResources(scene);
      gpuScene.updateMaterials(materials, textures);
      return;
    }
    if (level >= PtInvalidationLevel.Geometry) {
      gpuScene.updateSpheres(this.compileSpheres(scene));
      if (level === PtInvalidationLevel.Scene) {
        const { materials, textures } = this.compileMaterialResources(scene);
        gpuScene.updateMaterials(materials, textures);
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

  private compileMaterialResources(scene: PtScene): {
    materials: GpuMaterial[];
    textures: GpuTexture[];
  } {
    const textures: GpuTexture[] = [];
    const materials = scene.getMaterials().map((material, uniformIndex) => {
      const metadata = getMaterialMetadata(material);
      if (metadata.materialId !== uniformIndex) {
        throw new Error(`Material IDs must be contiguous: ${metadata.materialId}`);
      }
      const textureId = textures.length;
      textures.push(this.compileTexture(metadata.texture, material));
      return this.compileMaterial(material, metadata.materialType, textureId);
    });
    return { materials, textures };
  }

  private compileTexture(
    texture: PtTexture,
    previewMaterial: PtPreviewMaterial
  ): GpuTexture {
    if (texture.type === PtTextureType.Checker) {
      return {
        type: GpuTextureType.Checker,
        colorA: texture.colorA.clone(),
        colorB: texture.colorB.clone(),
        scale: texture.scale,
        imageId: -1,
      };
    }
    if (texture.type === PtTextureType.Image) {
      return {
        type: GpuTextureType.Image,
        colorA: new THREE.Color(1, 0, 1),
        colorB: new THREE.Color(),
        scale: 1,
        imageId: 0,
      };
    }
    return {
      type: GpuTextureType.Constant,
      colorA: previewMaterial.color.clone(),
      colorB: new THREE.Color(),
      scale: 1,
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
