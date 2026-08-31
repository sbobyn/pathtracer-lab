import * as THREE from "three";
import type { PtColorInput } from "./PtMaterial";

export const RASTER_SHADOW_MAP_SIZE = 2048;
export const LEGACY_FUZZY_METAL_PREVIEW_METALNESS = 0.65;

export function legacyFuzzToPreviewRoughness(fuzz: number) {
  return Math.sqrt(THREE.MathUtils.clamp(fuzz, 0, 1));
}

export function configurePerlinMarblePreviewMaterial(
  material: THREE.MeshStandardMaterial,
  input: PtColorInput
) {
  const texture = input.texture;
  if (texture.type !== 3 || !input.textureEnabled) {
    material.onBeforeCompile = () => {};
    material.customProgramCacheKey = () => "standard";
    material.needsUpdate = true;
    return;
  }
  material.map = null;
  material.color.set(0xffffff);
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uPerlinColorA = { value: texture.colorA.clone().multiply(input.factor) };
    shader.uniforms.uPerlinColorB = { value: texture.colorB.clone().multiply(input.factor) };
    shader.uniforms.uPerlinScale = { value: texture.scale };
    shader.uniforms.uPerlinTurbulence = { value: texture.turbulence };
    shader.vertexShader = shader.vertexShader
      .replace("void main() {", "varying vec3 vPerlinWorldPosition;\nvoid main() {")
      .replace(
        "#include <worldpos_vertex>",
        "#include <worldpos_vertex>\nvPerlinWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;"
      );
    shader.fragmentShader = shader.fragmentShader
      .replace("void main() {", `${PERLIN_MARBLE_FRAGMENT_GLSL}\nvoid main() {`)
      .replace(
        "#include <map_fragment>",
        `float marble = 0.5 * (1.0 + sin(
          uPerlinScale * vPerlinWorldPosition.z +
          uPerlinTurbulence * perlinTurbulence(vPerlinWorldPosition)
        ));
        diffuseColor.rgb *= mix(uPerlinColorA, uPerlinColorB, marble);`
      );
  };
  material.customProgramCacheKey = () => "perlin-marble-v1";
  material.needsUpdate = true;
}

const PERLIN_MARBLE_FRAGMENT_GLSL = `
uniform vec3 uPerlinColorA;
uniform vec3 uPerlinColorB;
uniform float uPerlinScale;
uniform float uPerlinTurbulence;
varying vec3 vPerlinWorldPosition;

vec3 perlinGradient(vec3 cell) {
  vec3 value = fract(sin(vec3(
    dot(cell, vec3(127.1, 311.7, 74.7)),
    dot(cell, vec3(269.5, 183.3, 246.1)),
    dot(cell, vec3(113.5, 271.9, 124.6))
  )) * 43758.5453) * 2.0 - 1.0;
  return normalize(value + vec3(1e-4));
}

float perlinNoise(vec3 position) {
  vec3 cell = floor(position);
  vec3 local = fract(position);
  vec3 fade = local * local * local * (local * (local * 6.0 - 15.0) + 10.0);
  float n000 = dot(perlinGradient(cell + vec3(0, 0, 0)), local - vec3(0, 0, 0));
  float n100 = dot(perlinGradient(cell + vec3(1, 0, 0)), local - vec3(1, 0, 0));
  float n010 = dot(perlinGradient(cell + vec3(0, 1, 0)), local - vec3(0, 1, 0));
  float n110 = dot(perlinGradient(cell + vec3(1, 1, 0)), local - vec3(1, 1, 0));
  float n001 = dot(perlinGradient(cell + vec3(0, 0, 1)), local - vec3(0, 0, 1));
  float n101 = dot(perlinGradient(cell + vec3(1, 0, 1)), local - vec3(1, 0, 1));
  float n011 = dot(perlinGradient(cell + vec3(0, 1, 1)), local - vec3(0, 1, 1));
  float n111 = dot(perlinGradient(cell + vec3(1, 1, 1)), local - vec3(1, 1, 1));
  return mix(mix(mix(n000, n100, fade.x), mix(n010, n110, fade.x), fade.y),
             mix(mix(n001, n101, fade.x), mix(n011, n111, fade.x), fade.y), fade.z);
}

float perlinTurbulence(vec3 position) {
  float sum = 0.0;
  float weight = 1.0;
  for (int octave = 0; octave < 7; octave++) {
    sum += weight * perlinNoise(position);
    position *= 2.0;
    weight *= 0.5;
  }
  return abs(sum);
}`;

export function createGradientReflectionTexture(
  top: THREE.Color,
  bottom: THREE.Color
) {
  const horizon = top.clone().lerp(bottom, 0.5);
  const face = (color: THREE.Color) => ({
    data: new Uint8Array([
      Math.round(THREE.MathUtils.clamp(color.r, 0, 1) * 255),
      Math.round(THREE.MathUtils.clamp(color.g, 0, 1) * 255),
      Math.round(THREE.MathUtils.clamp(color.b, 0, 1) * 255),
      255,
    ]),
    width: 1,
    height: 1,
  });
  const texture = new THREE.CubeTexture([
    face(horizon),
    face(horizon),
    face(top),
    face(bottom),
    face(horizon),
    face(horizon),
  ]);
  texture.mapping = THREE.CubeReflectionMapping;
  texture.needsUpdate = true;
  return texture;
}

export function createFuzzyMetalPreviewMaterial(
  color: THREE.Color,
  map: THREE.Texture | null,
  fuzz: number
) {
  return new THREE.MeshStandardMaterial({
    color,
    map,
    // A legacy RTIOW metal is a pure conductor, but gradient-only raster
    // scenes do not have enough image-based lighting for a pure PBR metal to
    // remain readable. Keep it predominantly metallic while retaining a
    // small diffuse component as a preview approximation.
    metalness: LEGACY_FUZZY_METAL_PREVIEW_METALNESS,
    // RTIOW fuzz perturbs the reflected ray directly, whereas Three.js uses
    // perceptual microfacet roughness. The square root is a closer visual
    // mapping than passing the legacy fuzz value through unchanged.
    roughness: legacyFuzzToPreviewRoughness(fuzz),
  });
}

export function createSolidGlassPreviewMaterial(
  color: THREE.Color,
  map: THREE.Texture | null,
  ior: number
) {
  return new THREE.MeshPhysicalMaterial({
    color,
    map,
    metalness: 0,
    roughness: 0,
    ior,
    transmission: 1,
    // A zero thickness models a transmissive sheet. A non-zero optical
    // volume better matches a closed dielectric object in the path tracer.
    thickness: 1,
    attenuationColor: color,
    attenuationDistance: Infinity,
    opacity: 1,
    transparent: true,
  });
}

/** Apply the shared presentation baseline without color-converting render targets. */
export function configureRasterRenderer(renderer: THREE.WebGLRenderer) {
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
}

export function configureRasterMesh(mesh: THREE.Mesh) {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
}

export function configureRasterLightShadow(
  light: THREE.PointLight | THREE.SpotLight | THREE.DirectionalLight
) {
  light.castShadow = true;
  const size = light instanceof THREE.DirectionalLight
    ? RASTER_SHADOW_MAP_SIZE
    : 1024;
  light.shadow.mapSize.set(size, size);
  light.shadow.camera.near = 0.05;
  light.shadow.camera.far = 100;
  light.shadow.bias = 0.0001;
  light.shadow.normalBias = 0.015;
  light.shadow.radius = 3;
  light.shadow.blurSamples = 8;
  if (light instanceof THREE.DirectionalLight) {
    light.shadow.camera.left = -20;
    light.shadow.camera.right = 20;
    light.shadow.camera.top = 20;
    light.shadow.camera.bottom = -20;
  }
}
