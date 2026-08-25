import type { GpuMaterial } from "./GpuScene";
import type { PtMaterialDefinition } from "./PtMaterial.ts";

export function compileGpuMaterial(
  definition: PtMaterialDefinition,
  baseColorTextureId: number,
  emissionTextureId: number
): GpuMaterial {
  return {
    model: definition.model,
    baseColorTextureId,
    emissionTextureId,
    baseColorFactor: definition.baseColor.factor.clone(),
    emissionFactor: definition.emission.color.factor.clone(),
    roughness: definition.roughness,
    ior: definition.ior,
    emissionStrength: definition.emission.strength,
    emissionTwoSided: definition.emission.twoSided,
  };
}
