import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { translateStaticGltfMaterial } from "../src/pathtracer/GltfMaterialTranslator.ts";
import { PtMaterialModel } from "../src/pathtracer/PtMaterial.ts";
import { PtTextureType } from "../src/pathtracer/PtTexture.ts";

test("glTF standard materials retain continuous metallic-roughness semantics", () => {
  const baseColorMap = new THREE.Texture();
  const metallicRoughnessMap = new THREE.Texture();
  const emissiveMap = new THREE.Texture();
  const source = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0.8, 0.6, 0.4),
    metalness: 0.37,
    roughness: 0.62,
    emissive: new THREE.Color(0.2, 0.1, 0.05),
    emissiveIntensity: 2.5,
    side: THREE.DoubleSide,
  });
  source.map = baseColorMap;
  source.metalnessMap = metallicRoughnessMap;
  source.roughnessMap = metallicRoughnessMap;
  source.emissiveMap = emissiveMap;

  const translated = translateStaticGltfMaterial(source).definition;
  assert.equal(translated.model, PtMaterialModel.PrincipledMetallicRoughness);
  assert.equal(translated.metallic, 0.37);
  assert.equal(translated.roughness, 0.62);
  assert.equal(translated.ior, 1.5);
  assert.equal(translated.baseColor.texture.type, PtTextureType.Image);
  assert.equal(translated.metallicRoughnessTexture.type, PtTextureType.Image);
  assert.equal(translated.emission.color.texture.type, PtTextureType.Image);
  assert.equal(translated.emission.strength, 2.5);
  assert.equal(translated.emission.twoSided, true);
  assert.ok(translated.baseColor.factor.equals(source.color));
  assert.ok(translated.emission.color.factor.equals(source.emissive));
});

test("glTF physical materials preserve authored IOR", () => {
  const source = new THREE.MeshPhysicalMaterial({ ior: 1.33 });
  assert.equal(translateStaticGltfMaterial(source).definition.ior, 1.33);
});
