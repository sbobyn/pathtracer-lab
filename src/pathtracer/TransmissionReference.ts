import * as THREE from "three";

/** Beer-Lambert transmittance using glTF's attenuation color/distance form. */
export function volumeAttenuation(
  attenuationColor: THREE.Color,
  attenuationDistance: number,
  distanceInMedium: number
): THREE.Color {
  if (!Number.isFinite(attenuationDistance)) return new THREE.Color(1, 1, 1);
  const safeDistance = Math.max(attenuationDistance, 1e-6);
  const exponent = Math.max(distanceInMedium, 0) / safeDistance;
  return new THREE.Color(
    Math.pow(Math.max(attenuationColor.r, 1e-6), exponent),
    Math.pow(Math.max(attenuationColor.g, 1e-6), exponent),
    Math.pow(Math.max(attenuationColor.b, 1e-6), exponent)
  );
}

/**
 * Reference state transition for the bounded nested-medium stack mirrored by
 * the WebGL integrator. Thin-walled boundaries never enter the stack.
 */
export function updateMediumStack(
  stack: readonly number[],
  materialId: number,
  frontFace: boolean,
  transmitted: boolean,
  thickness: number,
  capacity = 4
): number[] {
  const result = [...stack];
  if (!transmitted || thickness <= 0) return result;
  if (frontFace) {
    if (result.length < capacity) result.push(materialId);
  } else if (result.at(-1) === materialId) {
    result.pop();
  }
  return result;
}
