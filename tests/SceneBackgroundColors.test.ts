import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { setSceneGradientColor } from "../src/pathtracer/SceneBackgroundColors.ts";

function scene() {
  return { backgroundColorTop: new THREE.Color(0), backgroundColorBottom: new THREE.Color(0),
    scene: new THREE.Scene(), dirLight: new THREE.DirectionalLight() };
}

test("gradient edits retain the authoritative color references used by uniforms and snapshots", () => {
  const state = scene();
  const originalTop = state.backgroundColorTop;
  const originalBottom = state.backgroundColorBottom;
  assert.equal(setSceneGradientColor(state, "top", "#123456", true), originalTop);
  assert.equal(setSceneGradientColor(state, "bottom", "#abcdef", true), originalBottom);
  assert.equal(state.scene.background, originalTop);
  assert.equal(state.backgroundColorTop.clone().getHexString(), "123456");
  assert.equal(state.backgroundColorBottom.clone().getHexString(), "abcdef");
  assert.equal(state.dirLight.color.getHexString(), "123456");
  assert.notEqual(state.dirLight.color, originalTop);
  setSceneGradientColor(state, "top", "#000000", true);
  assert.equal(originalTop.getHex(), 0);
  assert.equal(originalBottom.getHexString(), "abcdef");
});

test("editing stored gradient colors does not replace an active HDR background or light", () => {
  const state = scene();
  const hdr = new THREE.Texture();
  state.scene.background = hdr;
  const lightColor = state.dirLight.color.clone();
  setSceneGradientColor(state, "top", "#ff0000", false);
  setSceneGradientColor(state, "bottom", "#0000ff", false);
  assert.equal(state.scene.background, hdr);
  assert.ok(state.dirLight.color.equals(lightColor));
  assert.equal(state.backgroundColorTop.getHexString(), "ff0000");
  assert.equal(state.backgroundColorBottom.getHexString(), "0000ff");
});
