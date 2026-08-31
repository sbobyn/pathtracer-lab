import * as THREE from "three";

export const RASTER_SHADOW_MAP_SIZE = 2048;

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
