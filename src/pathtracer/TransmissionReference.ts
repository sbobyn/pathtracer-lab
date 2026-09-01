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

/** Khronos KHR_materials_dispersion RGB approximation (20 / Abbe number). */
export function dispersionIors(ior: number, dispersion: number): THREE.Vector3 {
  const safeIor = Math.max(ior, 1);
  const halfSpread = (safeIor - 1) * 0.025 * Math.max(dispersion, 0);
  return new THREE.Vector3(
    Math.max(1, safeIor - halfSpread),
    safeIor,
    safeIor + halfSpread
  );
}

export interface RoughDielectricSample {
  direction: THREE.Vector3;
  pdf: number;
  transmitted: boolean;
  totalInternalReflection: boolean;
  valid: boolean;
}

/**
 * CPU reference for the GGX dielectric boundary mirrored in GLSL. It samples
 * the NDF (rather than a visible-normal distribution) so its PDF is compact
 * and deterministic enough for regression tests.
 */
export function sampleRoughDielectric(
  normal: THREE.Vector3,
  viewDirection: THREE.Vector3,
  roughness: number,
  etaIncident: number,
  etaTransmitted: number,
  microfacetSample: THREE.Vector2,
  fresnelSample: number
): RoughDielectricSample {
  const n = normal.clone().normalize();
  const v = viewDirection.clone().normalize();
  const alpha = Math.max(roughness, 0.045) ** 2;
  const microfacet = sampleGgxNormal(n, alpha, microfacetSample);
  if (microfacet.dot(v) < 0) microfacet.negate();
  const fresnel = dielectricFresnel(
    Math.abs(v.dot(microfacet)),
    etaIncident,
    etaTransmitted
  );
  const ratio = etaIncident / etaTransmitted;
  const transmitted = refract(v.clone().negate(), microfacet, ratio);
  const totalInternalReflection = transmitted === null;
  const useReflection = totalInternalReflection || fresnelSample < fresnel;
  const direction = useReflection
    ? v.clone().negate().reflect(microfacet).normalize()
    : transmitted;
  const pdf = roughDielectricPdf(
    n,
    v,
    direction,
    roughness,
    etaIncident,
    etaTransmitted
  );
  return {
    direction,
    pdf,
    transmitted: !useReflection,
    totalInternalReflection,
    valid: Number.isFinite(pdf) && pdf > 0 && direction.lengthSq() > 0,
  };
}

export function roughDielectricPdf(
  normal: THREE.Vector3,
  viewDirection: THREE.Vector3,
  outgoingDirection: THREE.Vector3,
  roughness: number,
  etaIncident: number,
  etaTransmitted: number
): number {
  const n = normal.clone().normalize();
  const v = viewDirection.clone().normalize();
  const o = outgoingDirection.clone().normalize();
  const reflected = n.dot(o) > 0;
  const eta = etaTransmitted / etaIncident;
  const half = reflected
    ? v.clone().add(o)
    : v.clone().addScaledVector(o, eta);
  if (half.lengthSq() <= 1e-16) return 0;
  half.normalize();
  if (half.dot(n) < 0) half.negate();
  const noH = Math.max(n.dot(half), 0);
  const voH = Math.abs(v.dot(half));
  const ooH = Math.abs(o.dot(half));
  if (noH <= 0 || voH <= 0 || ooH <= 0) return 0;
  const alpha = Math.max(roughness, 0.045) ** 2;
  const microfacetPdf = ggxDistribution(noH, alpha) * noH;
  const fresnel = dielectricFresnel(voH, etaIncident, etaTransmitted);
  if (reflected) {
    return fresnel * microfacetPdf / Math.max(4 * ooH, 1e-8);
  }
  const denominator = v.dot(half) + eta * o.dot(half);
  const jacobian = Math.abs(
    eta * eta * o.dot(half) / Math.max(denominator * denominator, 1e-12)
  );
  return (1 - fresnel) * microfacetPdf * jacobian;
}

export function dielectricFresnel(
  cosineIncident: number,
  etaIncident: number,
  etaTransmitted: number
): number {
  const cosI = THREE.MathUtils.clamp(Math.abs(cosineIncident), 0, 1);
  const sinT = etaIncident / etaTransmitted * Math.sqrt(Math.max(0, 1 - cosI * cosI));
  if (sinT >= 1) return 1;
  const cosT = Math.sqrt(Math.max(0, 1 - sinT * sinT));
  const parallel = (
    etaTransmitted * cosI - etaIncident * cosT
  ) / Math.max(etaTransmitted * cosI + etaIncident * cosT, 1e-12);
  const perpendicular = (
    etaIncident * cosI - etaTransmitted * cosT
  ) / Math.max(etaIncident * cosI + etaTransmitted * cosT, 1e-12);
  return 0.5 * (parallel * parallel + perpendicular * perpendicular);
}

/** Current deliberate visibility contract: boundary intersections occlude NEE. */
export function directShadowVisibility(blockerCount: number): number {
  return blockerCount === 0 ? 1 : 0;
}

function sampleGgxNormal(
  normal: THREE.Vector3,
  alpha: number,
  sample: THREE.Vector2
): THREE.Vector3 {
  const u = THREE.MathUtils.clamp(sample.x, 0, 1 - Number.EPSILON);
  const phi = 2 * Math.PI * THREE.MathUtils.clamp(sample.y, 0, 1);
  const alphaSquared = alpha * alpha;
  const cosTheta = Math.sqrt((1 - u) / Math.max(1 + (alphaSquared - 1) * u, 1e-8));
  const sinTheta = Math.sqrt(Math.max(0, 1 - cosTheta * cosTheta));
  const helper = Math.abs(normal.z) < 0.999
    ? new THREE.Vector3(0, 0, 1)
    : new THREE.Vector3(1, 0, 0);
  const tangent = new THREE.Vector3().crossVectors(helper, normal).normalize();
  const bitangent = new THREE.Vector3().crossVectors(normal, tangent);
  return tangent.multiplyScalar(Math.cos(phi) * sinTheta)
    .addScaledVector(bitangent, Math.sin(phi) * sinTheta)
    .addScaledVector(normal, cosTheta)
    .normalize();
}

function ggxDistribution(noH: number, alpha: number): number {
  const alphaSquared = alpha * alpha;
  const denominator = noH * noH * (alphaSquared - 1) + 1;
  return alphaSquared / Math.max(Math.PI * denominator * denominator, 1e-12);
}

function refract(
  incident: THREE.Vector3,
  normal: THREE.Vector3,
  eta: number
): THREE.Vector3 | null {
  const cosI = THREE.MathUtils.clamp(-incident.dot(normal), -1, 1);
  const sinT2 = eta * eta * Math.max(0, 1 - cosI * cosI);
  if (sinT2 >= 1) return null;
  return incident.clone().multiplyScalar(eta)
    .addScaledVector(normal, eta * cosI - Math.sqrt(Math.max(0, 1 - sinT2)))
    .normalize();
}
