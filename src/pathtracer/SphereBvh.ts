import * as THREE from "three";
import type { GpuSphere } from "./GpuScene.ts";
import type { BvhRay, TriangleBvhNode } from "./TriangleBvh.ts";
import { hitAabb } from "./TriangleBvh.ts";

export interface SphereBvhStats {
  sphereCount: number;
  nodeCount: number;
  leafCount: number;
  maxDepth: number;
  maxLeafSize: number;
}

export interface SphereBvh {
  nodes: TriangleBvhNode[];
  sphereIndices: number[];
  stats: SphereBvhStats;
}

export interface SphereBvhTraversalResult {
  sphereIndex: number;
  distance: number;
  nodeTests: number;
  sphereTests: number;
}

export type SphereBvhTraversalTraceEvent =
  | { kind: "node"; nodeIndex: number; hit: boolean; leaf: boolean }
  | { kind: "sphere"; nodeIndex: number; sphereIndex: number; distance: number | null; closest: boolean };

export interface SphereBvhTraversalTrace {
  ray: BvhRay;
  events: SphereBvhTraversalTraceEvent[];
  result: SphereBvhTraversalResult;
}

export interface SphereBvhNodeInfo {
  index: number;
  depth: number;
  leaf: boolean;
}

interface SphereReference {
  index: number;
  boundsMin: THREE.Vector3;
  boundsMax: THREE.Vector3;
  centroid: THREE.Vector3;
}

const DEFAULT_LEAF_SIZE = 4;

/**
 * Builds the same depth-first node layout as the triangle BVH, but leaves point
 * to analytic sphere indices. The bounds are only the broad phase: leaves still
 * use the exact quadratic sphere intersection.
 */
export function buildSphereBvh(
  spheres: readonly GpuSphere[],
  leafSize = DEFAULT_LEAF_SIZE
): SphereBvh {
  if (!Number.isInteger(leafSize) || leafSize < 1) {
    throw new RangeError(`BVH leaf size must be a positive integer, received ${leafSize}`);
  }

  const references = spheres.map(makeSphereReference);
  const nodes: TriangleBvhNode[] = [];
  const sphereIndices: number[] = [];
  let leafCount = 0;
  let maxDepth = 0;
  let maxLeafSize = 0;

  const build = (items: SphereReference[], depth: number): number => {
    const nodeIndex = nodes.length;
    const bounds = referenceBounds(items);
    nodes.push({ boundsMin: bounds.min, boundsMax: bounds.max, payload: 0, triangleCount: 0 });
    maxDepth = Math.max(maxDepth, depth);

    if (items.length <= leafSize) {
      const firstSphere = sphereIndices.length;
      sphereIndices.push(...items.map((item) => item.index));
      nodes[nodeIndex]!.payload = firstSphere;
      // The shared node layout stores a generic leaf item count in this field.
      nodes[nodeIndex]!.triangleCount = items.length;
      leafCount += 1;
      maxLeafSize = Math.max(maxLeafSize, items.length);
      return nodeIndex;
    }

    const centroidBounds = referenceBounds(items.map((item) => ({
      ...item,
      boundsMin: item.centroid,
      boundsMax: item.centroid,
    })));
    const extent = centroidBounds.max.clone().sub(centroidBounds.min);
    const axis = extent.x >= extent.y && extent.x >= extent.z
      ? "x"
      : extent.y >= extent.z ? "y" : "z";
    items.sort((a, b) => a.centroid[axis] - b.centroid[axis] || a.index - b.index);
    const middle = Math.floor(items.length / 2);
    build(items.slice(0, middle), depth + 1);
    const rightChild = build(items.slice(middle), depth + 1);
    nodes[nodeIndex]!.payload = rightChild;
    return nodeIndex;
  };

  if (references.length > 0) build(references, 0);
  return {
    nodes,
    sphereIndices,
    stats: {
      sphereCount: spheres.length,
      nodeCount: nodes.length,
      leafCount,
      maxDepth,
      maxLeafSize,
    },
  };
}

export function traverseSphereBvh(
  bvh: SphereBvh,
  spheres: readonly GpuSphere[],
  ray: BvhRay,
  minimumDistance = 0.001,
  maximumDistance = Number.POSITIVE_INFINITY
): SphereBvhTraversalResult {
  const result: SphereBvhTraversalResult = {
    sphereIndex: -1,
    distance: maximumDistance,
    nodeTests: 0,
    sphereTests: 0,
  };
  if (bvh.nodes.length === 0) return result;

  const stack = [0];
  while (stack.length > 0) {
    const nodeIndex = stack.pop()!;
    const node = bvh.nodes[nodeIndex];
    if (!node) throw new Error(`Malformed sphere BVH: node ${nodeIndex} does not exist`);
    result.nodeTests += 1;
    if (!hitAabb(ray, node.boundsMin, node.boundsMax, minimumDistance, result.distance)) continue;

    if (node.triangleCount > 0) {
      for (let offset = 0; offset < node.triangleCount; offset += 1) {
        const sphereIndex = bvh.sphereIndices[node.payload + offset];
        const sphere = sphereIndex === undefined ? undefined : spheres[sphereIndex];
        if (!sphere) {
          throw new Error(`Malformed sphere BVH: sphere reference ${node.payload + offset} does not exist`);
        }
        result.sphereTests += 1;
        const distance = hitSphereDistance(sphere, ray, minimumDistance, result.distance);
        if (distance !== null) {
          result.sphereIndex = sphereIndex;
          result.distance = distance;
        }
      }
      continue;
    }

    stack.push(node.payload, nodeIndex + 1);
  }
  return result;
}

/** Reconstructs visualization metadata from the exact flattened GPU layout. */
export function describeSphereBvh(bvh: SphereBvh): SphereBvhNodeInfo[] {
  if (bvh.nodes.length === 0) return [];
  const descriptions: SphereBvhNodeInfo[] = new Array(bvh.nodes.length);
  const visited = new Set<number>();
  const stack = [{ index: 0, depth: 0 }];
  while (stack.length > 0) {
    const entry = stack.pop()!;
    const node = bvh.nodes[entry.index];
    if (!node) throw new Error(`Malformed sphere BVH: node ${entry.index} does not exist`);
    if (visited.has(entry.index)) {
      throw new Error(`Malformed sphere BVH: node ${entry.index} is referenced more than once`);
    }
    visited.add(entry.index);
    const leaf = node.triangleCount > 0;
    descriptions[entry.index] = { index: entry.index, depth: entry.depth, leaf };
    if (!leaf) {
      stack.push(
        { index: node.payload, depth: entry.depth + 1 },
        { index: entry.index + 1, depth: entry.depth + 1 }
      );
    }
  }
  if (visited.size !== bvh.nodes.length) {
    throw new Error(`Malformed sphere BVH: ${bvh.nodes.length - visited.size} unreachable node(s)`);
  }
  return descriptions;
}

/** Records the exact CPU reference traversal order for the educational overlay. */
export function traceSphereBvhTraversal(
  bvh: SphereBvh,
  spheres: readonly GpuSphere[],
  ray: BvhRay,
  minimumDistance = 0.001,
  maximumDistance = Number.POSITIVE_INFINITY
): SphereBvhTraversalTrace {
  const result: SphereBvhTraversalResult = {
    sphereIndex: -1,
    distance: maximumDistance,
    nodeTests: 0,
    sphereTests: 0,
  };
  const events: SphereBvhTraversalTraceEvent[] = [];
  if (bvh.nodes.length === 0) return { ray, events, result };

  const stack = [0];
  while (stack.length > 0) {
    const nodeIndex = stack.pop()!;
    const node = bvh.nodes[nodeIndex];
    if (!node) throw new Error(`Malformed sphere BVH: node ${nodeIndex} does not exist`);
    result.nodeTests += 1;
    const nodeHit = hitAabb(ray, node.boundsMin, node.boundsMax, minimumDistance, result.distance);
    events.push({ kind: "node", nodeIndex, hit: nodeHit, leaf: node.triangleCount > 0 });
    if (!nodeHit) continue;

    if (node.triangleCount > 0) {
      for (let offset = 0; offset < node.triangleCount; offset += 1) {
        const sphereIndex = bvh.sphereIndices[node.payload + offset];
        const sphere = sphereIndex === undefined ? undefined : spheres[sphereIndex];
        if (!sphere) {
          throw new Error(`Malformed sphere BVH: sphere reference ${node.payload + offset} does not exist`);
        }
        result.sphereTests += 1;
        const distance = hitSphereDistance(sphere, ray, minimumDistance, result.distance);
        const closest = distance !== null;
        events.push({ kind: "sphere", nodeIndex, sphereIndex, distance, closest });
        if (distance !== null) {
          result.sphereIndex = sphereIndex;
          result.distance = distance;
        }
      }
      continue;
    }
    stack.push(node.payload, nodeIndex + 1);
  }
  return { ray, events, result };
}

export function hitSphereDistance(
  sphere: GpuSphere,
  ray: BvhRay,
  minimumDistance = 0.001,
  maximumDistance = Number.POSITIVE_INFINITY
): number | null {
  const toSphere = sphere.position.clone().sub(ray.origin);
  const a = ray.direction.lengthSq();
  const h = ray.direction.dot(toSphere);
  const c = toSphere.lengthSq() - sphere.radius * sphere.radius;
  const discriminant = h * h - a * c;
  if (discriminant < 0) return null;
  const rootOffset = Math.sqrt(discriminant);
  const near = (h - rootOffset) / a;
  if (minimumDistance < near && near < maximumDistance) return near;
  const far = (h + rootOffset) / a;
  return minimumDistance < far && far < maximumDistance ? far : null;
}

function makeSphereReference(sphere: GpuSphere, index: number): SphereReference {
  if (!Number.isFinite(sphere.radius) || sphere.radius <= 0) {
    throw new RangeError(`Sphere ${index} has invalid radius ${sphere.radius}`);
  }
  const extent = new THREE.Vector3(sphere.radius, sphere.radius, sphere.radius);
  return {
    index,
    boundsMin: sphere.position.clone().sub(extent),
    boundsMax: sphere.position.clone().add(extent),
    centroid: sphere.position.clone(),
  };
}

function referenceBounds(references: readonly SphereReference[]) {
  const min = new THREE.Vector3(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
  const max = new THREE.Vector3(Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY);
  for (const reference of references) {
    min.min(reference.boundsMin);
    max.max(reference.boundsMax);
  }
  return { min, max };
}
