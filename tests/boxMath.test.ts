import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { intersectBox } from "../src/pathtracer/boxMath.ts";

const box = {
  center: new THREE.Vector3(),
  halfSize: new THREE.Vector3(1, 2, 3),
  axisX: new THREE.Vector3(1, 0, 0),
  axisY: new THREE.Vector3(0, 1, 0),
  axisZ: new THREE.Vector3(0, 0, 1),
};

test("analytic box intersection returns the nearest slab and face normal", () => {
  const hit = intersectBox(box, new THREE.Vector3(0, 0, 5), new THREE.Vector3(0, 0, -1));
  assert.equal(hit?.t, 2);
  assert.deepEqual(hit?.normal.toArray(), [0, 0, 1]);
  assert.equal(hit?.frontFace, true);
});

test("analytic box intersection supports inside rays and misses", () => {
  const inside = intersectBox(box, new THREE.Vector3(), new THREE.Vector3(1, 0, 0));
  assert.equal(inside?.t, 1);
  assert.deepEqual(inside?.normal.toArray(), [1, 0, 0]);
  assert.equal(inside?.frontFace, false);
  assert.equal(intersectBox(box, new THREE.Vector3(2, 3, 5), new THREE.Vector3(0, 0, -1)), null);
});

test("analytic box intersection respects orientation", () => {
  const angle = Math.PI / 2;
  const rotated = {
    ...box,
    halfSize: new THREE.Vector3(1, 1, 2),
    axisX: new THREE.Vector3(Math.cos(angle), 0, -Math.sin(angle)),
    axisY: new THREE.Vector3(0, 1, 0),
    axisZ: new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle)),
  };
  const hit = intersectBox(rotated, new THREE.Vector3(4, 0, 0), new THREE.Vector3(-1, 0, 0));
  assert.ok(hit);
  assert.ok(Math.abs(hit.t - 2) < 1e-9);
});
