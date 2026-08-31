import type { GpuMaterial } from "./GpuScene";
import type { PtMaterialDefinition } from "./PtMaterial.ts";

export function compileGpuMaterial(
  definition: PtMaterialDefinition,
  baseColorTextureId: number,
  emissionTextureId: number,
  metallicRoughnessTextureId: number,
  transmissionTextureId: number,
  thicknessTextureId: number
): GpuMaterial {
  return {
    model: definition.model,
    baseColorTextureId,
    emissionTextureId,
    metallicRoughnessTextureId,
    transmissionTextureId,
    thicknessTextureId,
    textureEnableMask:
      (definition.baseColor.textureEnabled ? 1 : 0) |
      (definition.metallicRoughnessTextureEnabled ? 2 : 0) |
      (definition.emission.color.textureEnabled ? 4 : 0) |
      (definition.transmission.textureEnabled ? 8 : 0) |
      (definition.volume.thicknessTextureEnabled ? 16 : 0),
    baseColorFactor: definition.baseColor.factor.clone(),
    emissionFactor: definition.emission.color.factor.clone(),
    roughness: definition.roughness,
    metallic: definition.metallic,
    ior: definition.ior,
    transmission: definition.transmission.factor,
    thickness: definition.volume.thickness,
    attenuationColor: definition.volume.attenuationColor.clone(),
    attenuationDistance: definition.volume.attenuationDistance,
    dispersion: definition.dispersion,
    emissionStrength: definition.emission.strength,
    emissionTwoSided: definition.emission.twoSided,
  };
}
