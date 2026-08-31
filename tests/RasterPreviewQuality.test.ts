import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import {
  RASTER_SHADOW_MAP_SIZE,
  LEGACY_FUZZY_METAL_PREVIEW_METALNESS,
  createFuzzyMetalPreviewMaterial,
  createGradientReflectionTexture,
  configurePerlinMarblePreviewMaterial,
  createSolidGlassPreviewMaterial,
  configureRasterLightShadow,
  configureRasterMesh,
} from "../src/pathtracer/RasterPreviewQuality.ts";
import { perlinTexture } from "../src/pathtracer/PtTexture.ts";

test("Perlin marble descriptors inject procedural shading into PBR previews", () => {
  const texture = perlinTexture(0x101820, 0xe8dcc4, 4, 10);
  const material = new THREE.MeshStandardMaterial();
  configurePerlinMarblePreviewMaterial(material, {
    texture,
    factor: new THREE.Color(0xffffff),
    textureEnabled: true,
  });
  const shader = {
    uniforms: {},
    vertexShader: "void main() {\n#include <worldpos_vertex>\n}",
    fragmentShader: "void main() {\n#include <map_fragment>\n}",
  };
  material.onBeforeCompile(shader as never, {} as never);
  assert.match(shader.vertexShader, /vPerlinWorldPosition/);
  assert.match(shader.fragmentShader, /perlinTurbulence/);
  assert.match(shader.fragmentShader, /uPerlinScale/);
});

test("gradient reflection textures provide raster image-based lighting", () => {
  const texture = createGradientReflectionTexture(
    new THREE.Color(0.5, 0.7, 1),
    new THREE.Color(1, 1, 1)
  );
  assert.equal(texture.mapping, THREE.CubeReflectionMapping);
  assert.equal(texture.images.length, 6);
  assert.deepEqual(Array.from(texture.images[2].data), [128, 179, 255, 255]);
  assert.deepEqual(Array.from(texture.images[3].data), [255, 255, 255, 255]);
});

test("legacy fuzzy metals preview as PBR conductors", () => {
  const material = createFuzzyMetalPreviewMaterial(
    new THREE.Color(0.8, 0.6, 0.2),
    null,
    0.1
  );
  assert.equal(material.metalness, LEGACY_FUZZY_METAL_PREVIEW_METALNESS);
  assert.ok(Math.abs(material.roughness - Math.sqrt(0.1)) < 1e-12);
});

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

test("dielectric sphere previews use a solid transmissive volume", () => {
  const material = createSolidGlassPreviewMaterial(
    new THREE.Color(0xffffff),
    null,
    1.5
  );
  assert.equal(material.transmission, 1);
  assert.ok(material.thickness > 0);
  assert.equal(material.attenuationDistance, Infinity);
});
