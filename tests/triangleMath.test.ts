import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { intersectTriangle } from "../src/pathtracer/triangleMath.ts";

const a = new THREE.Vector3(0, 0, 0);
const b = new THREE.Vector3(1, 0, 0);
const c = new THREE.Vector3(0, 1, 0);

test("triangle intersection returns distance and normalized barycentrics", () => {
  const hit = intersectTriangle(
    new THREE.Vector3(0.25, 0.25, 1),
    new THREE.Vector3(0, 0, -1),
    a, b, c
  );
  assert.ok(hit);
  assert.equal(hit.t, 1);
  assert.deepEqual(hit.barycentrics.toArray(), [0.5, 0.25, 0.25]);
  assert.equal(hit.frontFace, true);
});

test("triangle intersection is two-sided and orients the geometric normal", () => {
  const hit = intersectTriangle(
    new THREE.Vector3(0.25, 0.25, -1),
    new THREE.Vector3(0, 0, 1),
    a, b, c
  );
  assert.ok(hit);
  assert.equal(hit.frontFace, false);
  assert.ok(hit.geometricNormal.distanceTo(new THREE.Vector3(0, 0, -1)) < 1e-12);
});

test("triangle intersection rejects outside and near-parallel rays", () => {
  assert.equal(intersectTriangle(new THREE.Vector3(1, 1, 1), new THREE.Vector3(0, 0, -1), a, b, c), null);
  assert.equal(intersectTriangle(new THREE.Vector3(0.25, 0.25, 1), new THREE.Vector3(1, 0, 1e-10), a, b, c), null);
});
