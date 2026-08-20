import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { intersectQuad, quadBounds } from "../src/pathtracer/quadMath.ts";

const q = new THREE.Vector3(0, 0, 0);
const u = new THREE.Vector3(2, 0, 0);
const v = new THREE.Vector3(0, 1, 0);

test("quad intersection returns bounded UVs from either face", () => {
  const front = intersectQuad(q, u, v, new THREE.Vector3(0.5, 0.25, 2), new THREE.Vector3(0, 0, -1));
  assert.deepEqual(front, { t: 2, u: 0.25, v: 0.25, frontFace: true });
  const back = intersectQuad(q, u, v, new THREE.Vector3(0.5, 0.25, -2), new THREE.Vector3(0, 0, 1));
  assert.deepEqual(back, { t: 2, u: 0.25, v: 0.25, frontFace: false });
  assert.equal(intersectQuad(q, u, v, new THREE.Vector3(2.01, 0.5, 2), new THREE.Vector3(0, 0, -1)), null);
});

test("quad edge and corner hits are inclusive", () => {
  assert.deepEqual(intersectQuad(q, u, v, new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1))?.u, 0);
  assert.deepEqual(intersectQuad(q, u, v, new THREE.Vector3(2, 1, 1), new THREE.Vector3(0, 0, -1))?.v, 1);
});

test("quad bounds enclose all corners and pad a flat axis", () => {
  const box = quadBounds(q, u, v);
  assert.ok(box.containsPoint(new THREE.Vector3(0, 0, 0)));
  assert.ok(box.containsPoint(new THREE.Vector3(2, 1, 0)));
  assert.ok(box.max.z > box.min.z);
});
