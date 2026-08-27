import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import type { GpuTriangle } from "../src/pathtracer/GpuScene.ts";
import { packTriangleBvh } from "../src/pathtracer/PackedTriangleBvh.ts";
import { buildTriangleBvh } from "../src/pathtracer/TriangleBvh.ts";
import { buildSphereBvh } from "../src/pathtracer/SphereBvh.ts";
import { packSphereBvh } from "../src/pathtracer/PackedTriangleBvh.ts";

const normal = new THREE.Vector3(0, 0, 1);
const triangle = (x: number): GpuTriangle => ({
  a: new THREE.Vector3(x, 0, 0), b: new THREE.Vector3(x + 1, 0, 0), c: new THREE.Vector3(x, 1, 0),
  normalA: normal, normalB: normal, normalC: normal,
  uvA: new THREE.Vector2(), uvB: new THREE.Vector2(1, 0), uvC: new THREE.Vector2(0, 1), materialId: 0,
});

test("packed BVH nodes and triangle indirection follow the documented layout", () => {
  const bvh = buildTriangleBvh([triangle(0), triangle(3), triangle(6)], 1);
  const packed = packTriangleBvh(bvh, 64);
  const nodeData = packed.nodeTexture.image.data as Float32Array;
  const indexData = packed.indexTexture.image.data as Float32Array;
  const root = bvh.nodes[0]!;
  assert.deepEqual(Array.from(nodeData.slice(0, 4)), [...root.boundsMin.toArray(), root.payload]);
  assert.deepEqual(Array.from(nodeData.slice(4, 8)), [...root.boundsMax.toArray(), root.triangleCount]);
  assert.deepEqual(bvh.triangleIndices.map((_, index) => indexData[index * 4]), bvh.triangleIndices);
  assert.equal(packed.nodeCount, bvh.nodes.length);
  packed.nodeTexture.dispose();
  packed.indexTexture.dispose();
});

test("packed BVH resources wrap rows and reject device capacity overflow", () => {
  const packed = packTriangleBvh(buildTriangleBvh([triangle(0), triangle(2)], 1), 4);
  assert.ok(packed.nodeTextureSize.y > 1);
  packed.nodeTexture.dispose();
  packed.indexTexture.dispose();
  assert.throws(() => packTriangleBvh(buildTriangleBvh(Array.from({ length: 32 }, (_, i) => triangle(i)), 1), 4), /capacity exceeded/);
});

test("sphere BVHs reuse the backend-neutral packed node and index layout", () => {
  const spheres = [0, 1, 2].map((x) => ({
    position: new THREE.Vector3(x * 2, 0, 0),
    radius: 0.5,
    materialId: x,
    uvMapping: 0,
  }));
  const bvh = buildSphereBvh(spheres, 1);
  const packed = packSphereBvh(bvh, 64);
  const indices = packed.indexTexture.image.data as Float32Array;
  assert.deepEqual(bvh.sphereIndices.map((_, index) => indices[index * 4]), bvh.sphereIndices);
  assert.equal(packed.nodeCount, bvh.nodes.length);
  packed.nodeTexture.dispose();
  packed.indexTexture.dispose();
});
