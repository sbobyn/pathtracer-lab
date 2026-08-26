import type { GpuMaterial } from "./GpuScene";
import type { PtMaterialDefinition } from "./PtMaterial.ts";

export function compileGpuMaterial(
  definition: PtMaterialDefinition,
  baseColorTextureId: number,
  emissionTextureId: number,
  metallicRoughnessTextureId: number
): GpuMaterial {
  return {
    model: definition.model,
    baseColorTextureId,
    emissionTextureId,
    metallicRoughnessTextureId,
    textureEnableMask:
      (definition.baseColor.textureEnabled ? 1 : 0) |
      (definition.metallicRoughnessTextureEnabled ? 2 : 0) |
      (definition.emission.color.textureEnabled ? 4 : 0),
    baseColorFactor: definition.baseColor.factor.clone(),
    emissionFactor: definition.emission.color.factor.clone(),
    roughness: definition.roughness,
    metallic: definition.metallic,
    ior: definition.ior,
    emissionStrength: definition.emission.strength,
    emissionTwoSided: definition.emission.twoSided,
  };
}
