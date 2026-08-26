import * as THREE from "three";

const PI = Math.PI;
const MIN_ROUGHNESS = 0.045;

export interface PrincipledBsdfParameters {
  baseColor: THREE.Color;
  metallic: number;
  roughness: number;
  ior: number;
}

export interface PrincipledBsdfSample {
  direction: THREE.Vector3;
  value: THREE.Color;
  pdf: number;
  strategy: "diffuse" | "specular";
  valid: boolean;
}

export function dielectricF0(ior: number): number {
  const safeIor = Math.max(1.0001, ior);
  const ratio = (safeIor - 1) / (safeIor + 1);
  return ratio * ratio;
}

export function principledF0(parameters: PrincipledBsdfParameters): THREE.Color {
  const metallic = THREE.MathUtils.clamp(parameters.metallic, 0, 1);
  const dielectric = dielectricF0(parameters.ior);
  return new THREE.Color(dielectric, dielectric, dielectric).lerp(parameters.baseColor, metallic);
}

export function evaluatePrincipledBsdf(
  parameters: PrincipledBsdfParameters,
  normal: THREE.Vector3,
  viewDirection: THREE.Vector3,
  lightDirection: THREE.Vector3
): THREE.Color {
  const n = normal.clone().normalize();
  const v = viewDirection.clone().normalize();
  const l = lightDirection.clone().normalize();
  const noV = Math.max(n.dot(v), 0);
  const noL = Math.max(n.dot(l), 0);
  if (noV <= 0 || noL <= 0) return new THREE.Color(0, 0, 0);

  const h = v.clone().add(l);
  if (h.lengthSq() <= 1e-16) return new THREE.Color(0, 0, 0);
  h.normalize();
  const noH = Math.max(n.dot(h), 0);
  const voH = Math.max(v.dot(h), 0);
  const alpha = perceptualRoughnessToAlpha(parameters.roughness);
  const fresnel = fresnelSchlick(principledF0(parameters), voH);
  const distribution = ggxDistribution(noH, alpha);
  const masking = smithG2(noV, noL, alpha);
  const specularScale = distribution * masking / Math.max(4 * noV * noL, 1e-8);
  const specular = fresnel.clone().multiplyScalar(specularScale);

  const metallic = THREE.MathUtils.clamp(parameters.metallic, 0, 1);
  const diffuse = parameters.baseColor.clone()
    .multiply(new THREE.Color(1 - fresnel.r, 1 - fresnel.g, 1 - fresnel.b))
    .multiplyScalar((1 - metallic) / PI);
  return diffuse.add(specular);
}

export function principledBsdfPdf(
  parameters: PrincipledBsdfParameters,
  normal: THREE.Vector3,
  viewDirection: THREE.Vector3,
  lightDirection: THREE.Vector3
): number {
  const n = normal.clone().normalize();
  const v = viewDirection.clone().normalize();
  const l = lightDirection.clone().normalize();
  const noL = Math.max(n.dot(l), 0);
  const noV = Math.max(n.dot(v), 0);
  if (noL <= 0 || noV <= 0) return 0;
  const h = v.clone().add(l);
  if (h.lengthSq() <= 1e-16) return 0;
  h.normalize();
  const noH = Math.max(n.dot(h), 0);
  const voH = Math.max(v.dot(h), 0);
  if (noH <= 0 || voH <= 0) return 0;

  const diffusePdf = noL / PI;
  const alpha = perceptualRoughnessToAlpha(parameters.roughness);
  const specularPdf = ggxDistribution(noH, alpha) * noH / Math.max(4 * voH, 1e-8);
  const specularProbability = principledSpecularProbability(parameters);
  return THREE.MathUtils.lerp(diffusePdf, specularPdf, specularProbability);
}

export function samplePrincipledBsdf(
  parameters: PrincipledBsdfParameters,
  normal: THREE.Vector3,
  viewDirection: THREE.Vector3,
  strategySample: number,
  directionSample: THREE.Vector2
): PrincipledBsdfSample {
  const n = normal.clone().normalize();
  const v = viewDirection.clone().normalize();
  const specularProbability = principledSpecularProbability(parameters);
  const strategy = strategySample < specularProbability ? "specular" : "diffuse";
  const localDirection = strategy === "specular"
    ? sampleGgxReflection(v, n, perceptualRoughnessToAlpha(parameters.roughness), directionSample)
    : localToWorld(sampleCosineHemisphere(directionSample), n);
  const pdf = principledBsdfPdf(parameters, n, v, localDirection);
  const value = evaluatePrincipledBsdf(parameters, n, v, localDirection);
  return {
    direction: localDirection,
    value,
    pdf,
    strategy,
    valid: pdf > 0 && Number.isFinite(pdf) && finiteColor(value),
  };
}

export function principledSpecularProbability(parameters: PrincipledBsdfParameters): number {
  const f0 = principledF0(parameters);
  const luminance = 0.2126 * f0.r + 0.7152 * f0.g + 0.0722 * f0.b;
  return THREE.MathUtils.clamp(luminance, 0.1, 0.9);
}

function perceptualRoughnessToAlpha(roughness: number): number {
  const perceptual = THREE.MathUtils.clamp(roughness, MIN_ROUGHNESS, 1);
  return perceptual * perceptual;
}

function ggxDistribution(noH: number, alpha: number): number {
  const alphaSquared = alpha * alpha;
  const denominator = noH * noH * (alphaSquared - 1) + 1;
  return alphaSquared / Math.max(PI * denominator * denominator, 1e-12);
}

function smithG1(noX: number, alpha: number): number {
  const alphaSquared = alpha * alpha;
  return 2 * noX / Math.max(noX + Math.sqrt(alphaSquared + (1 - alphaSquared) * noX * noX), 1e-8);
}

function smithG2(noV: number, noL: number, alpha: number): number {
  return smithG1(noV, alpha) * smithG1(noL, alpha);
}

function fresnelSchlick(f0: THREE.Color, cosine: number): THREE.Color {
  const weight = Math.pow(1 - THREE.MathUtils.clamp(cosine, 0, 1), 5);
  return f0.clone().lerp(new THREE.Color(1, 1, 1), weight);
}

function sampleCosineHemisphere(sample: THREE.Vector2): THREE.Vector3 {
  const radius = Math.sqrt(THREE.MathUtils.clamp(sample.x, 0, 1));
  const phi = 2 * PI * THREE.MathUtils.clamp(sample.y, 0, 1);
  return new THREE.Vector3(
    radius * Math.cos(phi),
    radius * Math.sin(phi),
    Math.sqrt(Math.max(0, 1 - radius * radius))
  );
}

function sampleGgxReflection(
  viewDirection: THREE.Vector3,
  normal: THREE.Vector3,
  alpha: number,
  sample: THREE.Vector2
): THREE.Vector3 {
  const u = THREE.MathUtils.clamp(sample.x, 0, 1 - Number.EPSILON);
  const phi = 2 * PI * THREE.MathUtils.clamp(sample.y, 0, 1);
  const alphaSquared = alpha * alpha;
  const cosTheta = Math.sqrt((1 - u) / Math.max(1 + (alphaSquared - 1) * u, 1e-8));
  const sinTheta = Math.sqrt(Math.max(0, 1 - cosTheta * cosTheta));
  const halfVector = localToWorld(new THREE.Vector3(
    sinTheta * Math.cos(phi), sinTheta * Math.sin(phi), cosTheta
  ), normal);
  return viewDirection.clone().negate().reflect(halfVector).normalize();
}

function localToWorld(direction: THREE.Vector3, normal: THREE.Vector3): THREE.Vector3 {
  const helper = Math.abs(normal.z) < 0.999
    ? new THREE.Vector3(0, 0, 1)
    : new THREE.Vector3(1, 0, 0);
  const tangent = new THREE.Vector3().crossVectors(helper, normal).normalize();
  const bitangent = new THREE.Vector3().crossVectors(normal, tangent);
  return tangent.multiplyScalar(direction.x)
    .addScaledVector(bitangent, direction.y)
    .addScaledVector(normal, direction.z)
    .normalize();
}

function finiteColor(color: THREE.Color): boolean {
  return Number.isFinite(color.r) && Number.isFinite(color.g) && Number.isFinite(color.b);
}
