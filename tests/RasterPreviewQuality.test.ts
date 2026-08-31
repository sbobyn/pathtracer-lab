import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import {
  RASTER_SHADOW_MAP_SIZE,
  configureRasterLightShadow,
  configureRasterMesh,
} from "../src/pathtracer/RasterPreviewQuality.ts";

test("raster meshes consistently cast and receive shadows", () => {
  const mesh = new THREE.Mesh();
  configureRasterMesh(mesh);
  assert.equal(mesh.castShadow, true);
  assert.equal(mesh.receiveShadow, true);
});

test("directional raster lights use the shared high-quality shadow policy", () => {
  const light = new THREE.DirectionalLight();
  configureRasterLightShadow(light);
  assert.equal(light.castShadow, true);
  assert.equal(light.shadow.mapSize.x, RASTER_SHADOW_MAP_SIZE);
  assert.equal(light.shadow.mapSize.y, RASTER_SHADOW_MAP_SIZE);
  assert.equal(light.shadow.camera.left, -20);
  assert.equal(light.shadow.camera.right, 20);
  assert.equal(light.shadow.normalBias, 0.015);
});

test("local raster lights use a bounded shadow-map budget", () => {
  const light = new THREE.PointLight();
  configureRasterLightShadow(light);
  assert.equal(light.shadow.mapSize.x, 1024);
  assert.equal(light.shadow.mapSize.y, 1024);
  assert.equal(light.shadow.camera.near, 0.05);
  assert.equal(light.shadow.camera.far, 100);
});
