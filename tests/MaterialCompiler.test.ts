import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { compileGpuMaterial } from "../src/pathtracer/MaterialCompiler.ts";
import PtMaterial, { PtMaterialModel } from "../src/pathtracer/PtMaterial.ts";
import { checkerTexture } from "../src/pathtracer/PtTexture.ts";

test("material compilation preserves authored semantics without preview-material state", () => {
  const material = new PtMaterial({
    model: PtMaterialModel.LegacyLambert,
    baseColor: {
      factor: new THREE.Color(0.5, 0.25, 1),
      texture: checkerTexture(0x112233, 0xaabbcc, 8),
    },
    roughness: 0.2,
    ior: 1.4,
    transmission: 0.75,
    thickness: 0.2,
    attenuationColor: new THREE.Color(0.8, 0.9, 1),
    attenuationDistance: 3,
    dispersion: 0.15,
    emissionColor: {
      factor: new THREE.Color(1, 0.5, 0.25),
      texture: checkerTexture(0xffffff, 0x000000, 2),
    },
    emissionStrength: 3,
    emissionTwoSided: true,
  });

  const compiled = compileGpuMaterial(material.definition, 7, 9, 11, 13, 15);

  assert.equal(compiled.model, PtMaterialModel.LegacyLambert);
  assert.equal(compiled.baseColorTextureId, 7);
  assert.equal(compiled.emissionTextureId, 9);
  assert.equal(compiled.metallicRoughnessTextureId, 11);
  assert.equal(compiled.transmissionTextureId, 13);
  assert.equal(compiled.thicknessTextureId, 15);
  assert.equal(compiled.textureEnableMask, 7);
  assert.deepEqual(compiled.baseColorFactor.toArray(), [0.5, 0.25, 1]);
  assert.deepEqual(compiled.emissionFactor.toArray(), [1, 0.5, 0.25]);
  assert.equal(compiled.roughness, 0.2);
  assert.equal(compiled.metallic, 0);
  assert.equal(compiled.ior, 1.4);
  assert.equal(compiled.transmission, 0.75);
  assert.equal(compiled.thickness, 0.2);
  assert.ok(compiled.attenuationColor.equals(new THREE.Color(0.8, 0.9, 1)));
  assert.equal(compiled.attenuationDistance, 3);
  assert.equal(compiled.dispersion, 0.15);
  assert.equal(compiled.emissionStrength, 3);
  assert.equal(compiled.emissionTwoSided, true);
});
