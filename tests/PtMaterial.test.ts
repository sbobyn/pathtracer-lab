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

test("a scattering material can author independent emission", () => {
  const material = new PtMaterial({
    model: PtMaterialModel.LegacyLambert,
    baseColor: new THREE.Color(0.25, 0.5, 0.75),
    emissionColor: new THREE.Color(1, 0.25, 0),
    emissionStrength: 3,
  });

  assert.equal(material.definition.model, PtMaterialModel.LegacyLambert);
  assert.equal(material.definition.emission.strength, 3);
  assert.deepEqual(
    material.definition.emission.color.texture.type === PtTextureType.Constant
      ? material.definition.emission.color.texture.color.toArray()
      : [],
    [1, 0.25, 0]
  );
});

test("color factors remain independent from texture inputs", () => {
  const texture = checkerTexture(0x112233, 0xaabbcc, 8);
  const material = PtMaterial.legacyLambert({
    factor: new THREE.Color(0.5, 0.25, 1),
    texture,
  });

  assert.equal(material.definition.baseColor.texture, texture);
  assert.deepEqual(material.definition.baseColor.factor.toArray(), [0.5, 0.25, 1]);
});

test("principled materials preserve continuous metallic-roughness inputs", () => {
  const dataTexture = checkerTexture(0x00ffff, 0xff00ff, 4);
  const material = PtMaterial.principledMetallicRoughness({
    baseColor: new THREE.Color(0.8, 0.35, 0.1),
    metallic: 0.65,
    roughness: 0.3,
    metallicRoughnessTexture: dataTexture,
    ior: 1.5,
  });

  assert.equal(material.definition.model, PtMaterialModel.PrincipledMetallicRoughness);
  assert.equal(material.definition.metallic, 0.65);
  assert.equal(material.definition.roughness, 0.3);
  assert.equal(material.definition.metallicRoughnessTexture, dataTexture);
});

test("principled materials preserve transmissive volume semantics", () => {
  const transmissionTexture = checkerTexture(0xffffff, 0x000000, 2);
  const thicknessTexture = checkerTexture(0x00ff00, 0x000000, 2);
  const material = PtMaterial.principledMetallicRoughness({
    transmission: 0.8,
    transmissionTexture,
    thickness: 0.35,
    thicknessTexture,
    attenuationColor: new THREE.Color(0.7, 0.85, 1),
    attenuationDistance: 2.5,
    dispersion: 0.12,
  });

  assert.equal(material.definition.transmission.factor, 0.8);
  assert.equal(material.definition.transmission.texture, transmissionTexture);
  assert.equal(material.definition.transmission.textureEnabled, true);
  assert.equal(material.definition.volume.thickness, 0.35);
  assert.equal(material.definition.volume.thicknessTexture, thicknessTexture);
  assert.equal(material.definition.volume.thicknessTextureEnabled, true);
  assert.ok(material.definition.volume.attenuationColor.equals(new THREE.Color(0.7, 0.85, 1)));
  assert.equal(material.definition.volume.attenuationDistance, 2.5);
  assert.equal(material.definition.dispersion, 0.12);
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
