import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import type { GpuTriangle } from "../src/pathtracer/GpuScene.ts";
import { buildTriangleBvh, describeTriangleBvh, hitAabb, hitTriangleDistance, measureTriangleBvh, traceTriangleBvhTraversal, traverseTriangleBvh } from "../src/pathtracer/TriangleBvh.ts";

function triangleAt(x: number, y = 0, z = 0): GpuTriangle {
  const normal = new THREE.Vector3(0, 0, 1);
  return {
    a: new THREE.Vector3(x, y, z), b: new THREE.Vector3(x + 0.8, y, z), c: new THREE.Vector3(x, y + 0.8, z),
    normalA: normal.clone(), normalB: normal.clone(), normalC: normal.clone(),
    uvA: new THREE.Vector2(), uvB: new THREE.Vector2(1, 0), uvC: new THREE.Vector2(0, 1), materialId: 0,
  };
}

test("AABB slabs handle parallel, negative, and missing rays", () => {
  const min = new THREE.Vector3(0, 0, 0), max = new THREE.Vector3(1, 1, 1);
  assert.equal(hitAabb({ origin: new THREE.Vector3(0.5, 0.5, -1), direction: new THREE.Vector3(0, 0, 1) }, min, max), true);
  assert.equal(hitAabb({ origin: new THREE.Vector3(0.5, 0.5, 2), direction: new THREE.Vector3(0, 0, -1) }, min, max), true);
  assert.equal(hitAabb({ origin: new THREE.Vector3(2, 0.5, -1), direction: new THREE.Vector3(0, 0, 1) }, min, max), false);
});

test("BVH construction is deterministic and every triangle occurs once", () => {
  const triangles = Array.from({ length: 17 }, (_, index) => triangleAt(index % 5, Math.floor(index / 5)));
  const first = buildTriangleBvh(triangles, 3);
  const second = buildTriangleBvh(triangles, 3);
  assert.deepEqual(first.triangleIndices, second.triangleIndices);
  assert.deepEqual(first.nodes.map((node) => [node.boundsMin.toArray(), node.boundsMax.toArray(), node.payload, node.triangleCount]),
    second.nodes.map((node) => [node.boundsMin.toArray(), node.boundsMax.toArray(), node.payload, node.triangleCount]));
  assert.deepEqual([...first.triangleIndices].sort((a, b) => a - b), triangles.map((_, index) => index));
  assert.equal(first.stats.triangleCount, triangles.length);
  assert.ok(first.stats.maxLeafSize <= 3);
  assert.equal(first.nodes[0]!.boundsMin.x, 0);
  assert.equal(first.nodes[0]!.boundsMax.x, 4.8);
});

test("BVH traversal matches brute force and skips triangle tests", () => {
  const triangles = Array.from({ length: 64 }, (_, index) => triangleAt(index * 2));
  const bvh = buildTriangleBvh(triangles, 2);
  const ray = { origin: new THREE.Vector3(40.2, 0.2, 10), direction: new THREE.Vector3(0, 0, -1) };
  const bruteForce = triangles.reduce(
    (closest, triangle, triangleIndex) => {
      const distance = hitTriangleDistance(triangle, ray, 1e-4, closest.distance);
      return distance === null ? closest : { triangleIndex, distance };
    },
    { triangleIndex: -1, distance: Number.POSITIVE_INFINITY }
  );
  const accelerated = traverseTriangleBvh(bvh, triangles, ray);
  assert.equal(accelerated.triangleIndex, bruteForce.triangleIndex);
  assert.equal(accelerated.distance, bruteForce.distance);
  assert.ok(accelerated.triangleTests < triangles.length / 4);
});

test("empty BVHs are valid and malformed node references fail explicitly", () => {
  assert.deepEqual(buildTriangleBvh([]).stats, {
    triangleCount: 0, nodeCount: 0, leafCount: 0, maxDepth: 0, maxLeafSize: 0,
  });
  const triangle = triangleAt(0);
  const bvh = buildTriangleBvh([triangle]);
  bvh.nodes[0]!.payload = 4;
  assert.throws(() => traverseTriangleBvh(bvh, [triangle], {
    origin: new THREE.Vector3(0.2, 0.2, 1), direction: new THREE.Vector3(0, 0, -1),
  }), /Malformed BVH/);
});

test("deterministic probe statistics expose BVH work relative to brute force", () => {
  const triangles = Array.from({ length: 64 }, (_, index) => triangleAt(index * 2));
  const stats = measureTriangleBvh(buildTriangleBvh(triangles, 2), triangles);
  assert.equal(stats.rayCount, 6);
  assert.equal(stats.bruteForceTriangleTests, 64);
  assert.ok(stats.averageNodeTests > 0);
  assert.ok(stats.averageTriangleTests < stats.bruteForceTriangleTests);
  assert.deepEqual(measureTriangleBvh(buildTriangleBvh([], 2), []), {
    rayCount: 0, hitCount: 0, averageNodeTests: 0, averageTriangleTests: 0, bruteForceTriangleTests: 0,
  });
});

test("hierarchy descriptions reconstruct the flattened production layout", () => {
  const bvh = buildTriangleBvh(Array.from({ length: 8 }, (_, index) => triangleAt(index * 2)), 2);
  const descriptions = describeTriangleBvh(bvh);
  assert.equal(descriptions.length, bvh.nodes.length);
  assert.equal(descriptions[0]!.depth, 0);
  assert.equal(descriptions[0]!.parentIndex, null);
  for (const description of descriptions) {
    if (description.leaf) {
      assert.ok(description.triangleCount > 0);
      assert.equal(description.leftChild, null);
      assert.equal(description.rightChild, null);
    } else {
      assert.equal(description.leftChild, description.index + 1);
      assert.equal(descriptions[description.leftChild!]!.parentIndex, description.index);
      assert.equal(descriptions[description.rightChild!]!.parentIndex, description.index);
      assert.equal(descriptions[description.leftChild!]!.depth, description.depth + 1);
    }
  }
  assert.deepEqual(describeTriangleBvh(buildTriangleBvh([])), []);
});

test("traversal traces preserve reference order and final hit", () => {
  const triangles = Array.from({ length: 8 }, (_, index) => triangleAt(index * 2));
  const bvh = buildTriangleBvh(triangles, 1);
  const ray = {
    origin: new THREE.Vector3(0.2, 0.2, 2),
    direction: new THREE.Vector3(0, 0, -1),
  };
  const trace = traceTriangleBvhTraversal(bvh, triangles, ray);
  const reference = traverseTriangleBvh(bvh, triangles, ray);

  assert.deepEqual(trace.result, reference);
  assert.equal(trace.events[0]?.kind, "node");
  assert.equal(trace.events.filter((event) => event.kind === "node").length, reference.nodeTests);
  assert.equal(trace.events.filter((event) => event.kind === "triangle").length, reference.triangleTests);
  assert.ok(trace.events.some((event) => event.kind === "node" && !event.hit));
  assert.ok(trace.events.some((event) => event.kind === "triangle" && event.closest));
});
