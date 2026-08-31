import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import {
  updateMediumStack,
  volumeAttenuation,
} from "../src/pathtracer/TransmissionReference.ts";

test("Beer-Lambert attenuation reaches the authored color at its reference distance", () => {
  const color = new THREE.Color(0.25, 0.5, 0.8);
  assert.ok(volumeAttenuation(color, 2, 2).equals(color));
  const doubled = volumeAttenuation(color, 2, 4);
  assert.ok(doubled.equals(new THREE.Color(0.25 ** 2, 0.5 ** 2, 0.8 ** 2)));
  assert.ok(volumeAttenuation(color, Infinity, 100).equals(new THREE.Color(1, 1, 1)));
});

test("nested volume boundaries push and pop while thin walls leave no medium", () => {
  let stack = updateMediumStack([], 4, true, true, 0);
  assert.deepEqual(stack, []);
  stack = updateMediumStack(stack, 4, true, true, 0.5);
  stack = updateMediumStack(stack, 7, true, true, 0.25);
  assert.deepEqual(stack, [4, 7]);
  stack = updateMediumStack(stack, 7, false, true, 0.25);
  stack = updateMediumStack(stack, 4, false, true, 0.5);
  assert.deepEqual(stack, []);
});

test("reflection and mismatched exits do not corrupt the active medium", () => {
  assert.deepEqual(updateMediumStack([2], 2, false, false, 1), [2]);
  assert.deepEqual(updateMediumStack([2, 3], 2, false, true, 1), [2, 3]);
  assert.deepEqual(updateMediumStack([1, 2, 3, 4], 5, true, true, 1), [1, 2, 3, 4]);
});
