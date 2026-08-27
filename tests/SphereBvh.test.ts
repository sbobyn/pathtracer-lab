import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import type { GpuSphere } from "../src/pathtracer/GpuScene.ts";
import { buildSphereBvh, describeSphereBvh, hitSphereDistance, traceSphereBvhTraversal, traverseSphereBvh } from "../src/pathtracer/SphereBvh.ts";

function sphere(x: number, radius = 0.5): GpuSphere {
  return {
    position: new THREE.Vector3(x, 0, 0),
    radius,
    materialId: 0,
    uvMapping: 0,
  };
}

test("sphere BVH construction is deterministic and uses conservative analytic bounds", () => {
  const spheres = [sphere(-3), sphere(0, 1), sphere(4)];
  const first = buildSphereBvh(spheres, 1);
  const second = buildSphereBvh(spheres, 1);

  assert.deepEqual(first.sphereIndices, second.sphereIndices);
  assert.deepEqual(first.stats, {
    sphereCount: 3,
    nodeCount: 5,
    leafCount: 3,
    maxDepth: 2,
    maxLeafSize: 1,
  });
  assert.deepEqual(first.nodes[0]!.boundsMin.toArray(), [-3.5, -1, -1]);
  assert.deepEqual(first.nodes[0]!.boundsMax.toArray(), [4.5, 1, 1]);
});

test("sphere BVH traversal preserves exact sphere intersections while rejecting work", () => {
  const spheres = Array.from({ length: 16 }, (_, index) => sphere(index * 3));
  const bvh = buildSphereBvh(spheres, 2);
  const ray = {
    origin: new THREE.Vector3(0, 0, -4),
    direction: new THREE.Vector3(0, 0, 1),
  };

  const result = traverseSphereBvh(bvh, spheres, ray);
  assert.equal(result.sphereIndex, 0);
  assert.equal(result.distance, 3.5);
  assert.ok(result.sphereTests < spheres.length);
  assert.equal(hitSphereDistance(spheres[0]!, ray), result.distance);
});

test("empty and invalid sphere BVHs fail explicitly", () => {
  assert.deepEqual(buildSphereBvh([]).stats, {
    sphereCount: 0,
    nodeCount: 0,
    leafCount: 0,
    maxDepth: 0,
    maxLeafSize: 0,
  });
  assert.throws(() => buildSphereBvh([sphere(0, 0)]), /invalid radius/);

  const spheres = [sphere(0)];
  const bvh = buildSphereBvh(spheres);
  bvh.sphereIndices[0] = 4;
  assert.throws(() => traverseSphereBvh(bvh, spheres, {
    origin: new THREE.Vector3(0, 0, -4),
    direction: new THREE.Vector3(0, 0, 1),
  }), /Malformed sphere BVH/);
});

test("sphere hierarchy descriptions follow the flattened production nodes", () => {
  const descriptions = describeSphereBvh(buildSphereBvh([
    sphere(-3), sphere(-1), sphere(1), sphere(3),
  ], 1));
  assert.equal(descriptions.length, 7);
  assert.deepEqual(descriptions.map(({ depth }) => depth), [0, 1, 2, 2, 1, 2, 2]);
  assert.equal(descriptions.filter(({ leaf }) => leaf).length, 4);
  assert.deepEqual(describeSphereBvh(buildSphereBvh([])), []);
});

test("sphere traversal traces preserve reference order and final analytic hit", () => {
  const spheres = [sphere(-2), sphere(0), sphere(2)];
  const bvh = buildSphereBvh(spheres, 1);
  const ray = { origin: new THREE.Vector3(0, 0, -4), direction: new THREE.Vector3(0, 0, 1) };
  const trace = traceSphereBvhTraversal(bvh, spheres, ray);
  const reference = traverseSphereBvh(bvh, spheres, ray);
  assert.deepEqual(trace.result, reference);
  assert.equal(trace.events.filter(({ kind }) => kind === "node").length, trace.result.nodeTests);
  assert.equal(trace.events.filter(({ kind }) => kind === "sphere").length, trace.result.sphereTests);
});
