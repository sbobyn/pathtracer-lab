import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { packMaterialTexture, packTextureTexture } from "../src/pathtracer/PackedMaterialTextures.ts";
import type { GpuMaterial, GpuTexture } from "../src/pathtracer/GpuScene.ts";

test("material packing preserves semantic factors in the extensible four-texel layout", () => {
  const material: GpuMaterial = {
    model: 3, baseColorTextureId: 4, emissionTextureId: 5, roughness: 0.25, ior: 1.5,
    metallicRoughnessTextureId: 6, metallic: 0.75, textureEnableMask: 7,
    baseColorFactor: new THREE.Color(0.25, 0.5, 0.75),
    emissionFactor: new THREE.Color(1, 0.125, 0),
    emissionStrength: 7, emissionTwoSided: true,
  };
  const packed = packMaterialTexture([material], 64);
  assert.deepEqual(Array.from(packed.texture.image.data as Float32Array).slice(0, 16), [
    3, 4, 5, 0.25,
    0.25, 0.5, 0.75, 1.5,
    1, 0.125, 0, 7,
    1, 6, 0.75, 7,
  ]);
  packed.texture.dispose();
});

test("texture descriptor packing preserves colors and procedural settings", () => {
  const texture: GpuTexture = {
    type: 1,
    imageId: -1,
    scale: 6,
    turbulence: 2,
    colorA: new THREE.Color(0.25, 0.5, 0.75),
    colorB: new THREE.Color(1, 0.125, 0),
  };
  const packed = packTextureTexture([texture], 64);
  assert.deepEqual(Array.from(packed.texture.image.data as Float32Array).slice(0, 12), [
    1, -1, 6, 2,
    0.25, 0.5, 0.75, 0,
    1, 0.125, 0, 0,
  ]);
  packed.texture.dispose();
});
