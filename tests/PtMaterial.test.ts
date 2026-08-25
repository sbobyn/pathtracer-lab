import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import PtMaterial, { PtMaterialModel, PtMaterialType } from "../src/pathtracer/PtMaterial.ts";
import { checkerTexture, PtTextureType } from "../src/pathtracer/PtTexture.ts";

test("structured legacy factories preserve the current compatibility view", () => {
  const texture = checkerTexture(0x112233, 0xaabbcc, 8);
  const diffuse = PtMaterial.legacyLambert(texture);
  const metal = PtMaterial.legacyFuzzyMetal(new THREE.Color(0.8, 0.7, 0.6), 0.25);
  const glass = PtMaterial.legacyDielectric(1.5);

  assert.equal(diffuse.definition.model, PtMaterialModel.LegacyLambert);
  assert.equal(diffuse.type, PtMaterialType.Lambert);
  assert.equal(diffuse.texture.type, PtTextureType.Checker);
  assert.equal(metal.type, PtMaterialType.Metal);
  assert.equal(metal.fuzz, 0.25);
  assert.equal(glass.type, PtMaterialType.Dielectric);
  assert.equal(glass.ior, 1.5);
});

test("emission is authored independently from the no-BSDF surface model", () => {
  const light = PtMaterial.emissive(new THREE.Color(1, 0.5, 0.25), 12, true);

  assert.equal(light.definition.model, PtMaterialModel.NoBsdf);
  assert.equal(light.definition.baseColor.texture.type, PtTextureType.Constant);
  assert.equal(light.definition.emission.strength, 12);
  assert.equal(light.definition.emission.twoSided, true);
  assert.equal(light.emissionStrength, 12);
  assert.equal(light.texture, light.definition.emission.color.texture);
});

test("the positional constructor remains a temporary legacy adapter", () => {
  const material = new PtMaterial(
    PtMaterialType.Metal,
    new THREE.Color(0.7, 0.6, 0.5),
    0.1
  );

  assert.equal(material.definition.model, PtMaterialModel.LegacyFuzzyMetal);
  assert.equal(material.fuzz, 0.1);
});
