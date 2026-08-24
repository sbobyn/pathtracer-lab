import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { packTriangleTexture, unpackTriangle } from "../src/pathtracer/PackedTriangleTexture.ts";
import type { GpuTriangle } from "../src/pathtracer/GpuScene.ts";

const triangle: GpuTriangle = {
  a: new THREE.Vector3(1, 2, 3), b: new THREE.Vector3(4, 5, 6), c: new THREE.Vector3(7, 8, 9),
  normalA: new THREE.Vector3(1, 0, 0), normalB: new THREE.Vector3(0, 1, 0), normalC: new THREE.Vector3(0, 0, 1),
  uvA: new THREE.Vector2(0, 0), uvB: new THREE.Vector2(1, 0), uvC: new THREE.Vector2(0.5, 1), materialId: 7,
};

test("packed triangle data round-trips through the documented layout", () => {
  const packed = packTriangleTexture([triangle], 64);
  const decoded = unpackTriangle(packed.texture.image.data as Float32Array, 0);
  assert.deepEqual(decoded.a.toArray(), triangle.a.toArray());
  assert.deepEqual(decoded.normalC.toArray(), triangle.normalC.toArray());
  assert.deepEqual(decoded.uvB.toArray(), triangle.uvB.toArray());
  assert.equal(decoded.materialId, triangle.materialId);
  packed.texture.dispose();
});

test("packing wraps texels across rows and rejects device capacity overflow", () => {
  const packed = packTriangleTexture([triangle, triangle], 8);
  assert.deepEqual(packed.size.toArray(), [8, 2]);
  assert.throws(() => packTriangleTexture(Array(9).fill(triangle), 8), /capacity exceeded/);
  packed.texture.dispose();
});
