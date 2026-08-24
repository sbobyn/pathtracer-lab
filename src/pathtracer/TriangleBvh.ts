import * as THREE from "three";
import type { GpuTriangle } from "./GpuScene";

export interface TriangleBvhNode {
  boundsMin: THREE.Vector3;
  boundsMax: THREE.Vector3;
  /** First triangle-index offset for leaves; right-child node index for branches. */
  payload: number;
  /** A positive value identifies a leaf; branches always have zero triangles. */
  triangleCount: number;
}

export interface TriangleBvhStats {
  triangleCount: number;
  nodeCount: number;
  leafCount: number;
  maxDepth: number;
  maxLeafSize: number;
}

export interface TriangleBvh {
  nodes: TriangleBvhNode[];
  triangleIndices: number[];
  stats: TriangleBvhStats;
}

export interface TriangleBvhNodeInfo {
  index: number;
  parentIndex: number | null;
  depth: number;
  leaf: boolean;
  leftChild: number | null;
  rightChild: number | null;
  firstTriangleOffset: number | null;
  triangleCount: number;
}

export interface BvhRay {
  origin: THREE.Vector3;
  direction: THREE.Vector3;
}

export interface BvhTraversalResult {
  triangleIndex: number;
  distance: number;
  nodeTests: number;
  triangleTests: number;
}

export type BvhTraversalTraceEvent =
  | { kind: "node"; nodeIndex: number; hit: boolean; leaf: boolean }
  | {
      kind: "triangle";
      nodeIndex: number;
      triangleIndex: number;
      distance: number | null;
      closest: boolean;
    };

export interface BvhTraversalTrace {
  ray: BvhRay;
  events: BvhTraversalTraceEvent[];
  result: BvhTraversalResult;
}

export interface BvhProbeStats {
  rayCount: number;
  hitCount: number;
  averageNodeTests: number;
  averageTriangleTests: number;
  bruteForceTriangleTests: number;
}

interface TriangleReference {
  index: number;
  boundsMin: THREE.Vector3;
  boundsMax: THREE.Vector3;
  centroid: THREE.Vector3;
}

const DEFAULT_LEAF_SIZE = 4;
const DIRECTION_EPSILON = 1e-12;

/**
 * Builds a depth-first flattened BVH. A branch's left child immediately follows
 * it, while `payload` stores the right child. Leaves point into triangleIndices.
 */
export function buildTriangleBvh(
  triangles: readonly GpuTriangle[],
  leafSize = DEFAULT_LEAF_SIZE
): TriangleBvh {
  if (!Number.isInteger(leafSize) || leafSize < 1) {
    throw new RangeError(`BVH leaf size must be a positive integer, received ${leafSize}`);
  }
  const references = triangles.map(makeTriangleReference);
  const nodes: TriangleBvhNode[] = [];
  const triangleIndices: number[] = [];
  let leafCount = 0;
  let maxDepth = 0;
  let maxLeafSize = 0;

  const build = (items: TriangleReference[], depth: number): number => {
    const nodeIndex = nodes.length;
    const bounds = referenceBounds(items);
    nodes.push({ boundsMin: bounds.min, boundsMax: bounds.max, payload: 0, triangleCount: 0 });
    maxDepth = Math.max(maxDepth, depth);

    if (items.length <= leafSize) {
      const firstTriangle = triangleIndices.length;
      triangleIndices.push(...items.map((item) => item.index));
      nodes[nodeIndex]!.payload = firstTriangle;
      nodes[nodeIndex]!.triangleCount = items.length;
      leafCount += 1;
      maxLeafSize = Math.max(maxLeafSize, items.length);
      return nodeIndex;
    }

    const centroidBounds = centroidReferenceBounds(items);
    const extent = centroidBounds.max.clone().sub(centroidBounds.min);
    const axis = extent.x >= extent.y && extent.x >= extent.z ? "x" : extent.y >= extent.z ? "y" : "z";
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
    triangleIndices,
    stats: { triangleCount: triangles.length, nodeCount: nodes.length, leafCount, maxDepth, maxLeafSize },
  };
}

/** Reconstructs hierarchy metadata from the exact depth-first GPU layout. */
export function describeTriangleBvh(bvh: TriangleBvh): TriangleBvhNodeInfo[] {
  if (bvh.nodes.length === 0) return [];
  const descriptions: TriangleBvhNodeInfo[] = new Array(bvh.nodes.length);
  const visited = new Set<number>();
  const stack = [{ index: 0, parentIndex: null as number | null, depth: 0 }];
  while (stack.length > 0) {
    const entry = stack.pop()!;
    if (entry.index < 0 || entry.index >= bvh.nodes.length) {
      throw new Error(`Malformed BVH: node ${entry.index} does not exist`);
    }
    if (visited.has(entry.index)) throw new Error(`Malformed BVH: node ${entry.index} is referenced more than once`);
    visited.add(entry.index);
    const node = bvh.nodes[entry.index]!;
    const leaf = node.triangleCount > 0;
    const leftChild = leaf ? null : entry.index + 1;
    const rightChild = leaf ? null : node.payload;
    descriptions[entry.index] = {
      index: entry.index,
      parentIndex: entry.parentIndex,
      depth: entry.depth,
      leaf,
      leftChild,
      rightChild,
      firstTriangleOffset: leaf ? node.payload : null,
      triangleCount: node.triangleCount,
    };
    if (!leaf) {
      stack.push(
        { index: rightChild!, parentIndex: entry.index, depth: entry.depth + 1 },
        { index: leftChild!, parentIndex: entry.index, depth: entry.depth + 1 }
      );
    }
  }
  if (visited.size !== bvh.nodes.length) {
    throw new Error(`Malformed BVH: ${bvh.nodes.length - visited.size} unreachable node(s)`);
  }
  return descriptions;
}

/** Robust slab test, including rays parallel to one or more box faces. */
export function hitAabb(
  ray: BvhRay,
  boundsMin: THREE.Vector3,
  boundsMax: THREE.Vector3,
  minDistance = 0,
  maxDistance = Number.POSITIVE_INFINITY
): boolean {
  for (const axis of ["x", "y", "z"] as const) {
    const origin = ray.origin[axis];
    const direction = ray.direction[axis];
    if (Math.abs(direction) < DIRECTION_EPSILON) {
      if (origin < boundsMin[axis] || origin > boundsMax[axis]) return false;
      continue;
    }
    const inverseDirection = 1 / direction;
    let near = (boundsMin[axis] - origin) * inverseDirection;
    let far = (boundsMax[axis] - origin) * inverseDirection;
    if (near > far) [near, far] = [far, near];
    minDistance = Math.max(minDistance, near);
    maxDistance = Math.min(maxDistance, far);
    if (maxDistance < minDistance) return false;
  }
  return true;
}

/** CPU reference traversal used to verify the packed shader traversal later. */
export function traverseTriangleBvh(
  bvh: TriangleBvh,
  triangles: readonly GpuTriangle[],
  ray: BvhRay,
  minDistance = 1e-4,
  maxDistance = Number.POSITIVE_INFINITY
): BvhTraversalResult {
  const result: BvhTraversalResult = {
    triangleIndex: -1, distance: maxDistance, nodeTests: 0, triangleTests: 0,
  };
  if (bvh.nodes.length === 0) return result;
  const stack = [0];
  while (stack.length > 0) {
    const nodeIndex = stack.pop()!;
    const node = bvh.nodes[nodeIndex];
    if (!node) throw new Error(`Malformed BVH: node ${nodeIndex} does not exist`);
    result.nodeTests += 1;
    if (!hitAabb(ray, node.boundsMin, node.boundsMax, minDistance, result.distance)) continue;
    if (node.triangleCount > 0) {
      for (let offset = 0; offset < node.triangleCount; offset += 1) {
        const triangleIndex = bvh.triangleIndices[node.payload + offset];
        const triangle = triangleIndex === undefined ? undefined : triangles[triangleIndex];
        if (!triangle) throw new Error(`Malformed BVH: triangle reference ${node.payload + offset} does not exist`);
        result.triangleTests += 1;
        const distance = hitTriangleDistance(triangle, ray, minDistance, result.distance);
        if (distance !== null) {
          result.triangleIndex = triangleIndex;
          result.distance = distance;
        }
      }
      continue;
    }
    stack.push(node.payload, nodeIndex + 1);
  }
  return result;
}

/** Records the CPU reference traversal without changing its production order. */
export function traceTriangleBvhTraversal(
  bvh: TriangleBvh,
  triangles: readonly GpuTriangle[],
  ray: BvhRay,
  minDistance = 1e-4,
  maxDistance = Number.POSITIVE_INFINITY
): BvhTraversalTrace {
  const result: BvhTraversalResult = {
    triangleIndex: -1, distance: maxDistance, nodeTests: 0, triangleTests: 0,
  };
  const events: BvhTraversalTraceEvent[] = [];
  if (bvh.nodes.length === 0) return { ray, events, result };
  const stack = [0];
  while (stack.length > 0) {
    const nodeIndex = stack.pop()!;
    const node = bvh.nodes[nodeIndex];
    if (!node) throw new Error(`Malformed BVH: node ${nodeIndex} does not exist`);
    result.nodeTests += 1;
    const nodeHit = hitAabb(ray, node.boundsMin, node.boundsMax, minDistance, result.distance);
    events.push({ kind: "node", nodeIndex, hit: nodeHit, leaf: node.triangleCount > 0 });
    if (!nodeHit) continue;
    if (node.triangleCount > 0) {
      for (let offset = 0; offset < node.triangleCount; offset += 1) {
        const triangleIndex = bvh.triangleIndices[node.payload + offset];
        const triangle = triangleIndex === undefined ? undefined : triangles[triangleIndex];
        if (!triangle) throw new Error(`Malformed BVH: triangle reference ${node.payload + offset} does not exist`);
        result.triangleTests += 1;
        const distance = hitTriangleDistance(triangle, ray, minDistance, result.distance);
        const closest = distance !== null;
        events.push({ kind: "triangle", nodeIndex, triangleIndex, distance, closest });
        if (distance !== null) {
          result.triangleIndex = triangleIndex;
          result.distance = distance;
        }
      }
      continue;
    }
    stack.push(node.payload, nodeIndex + 1);
  }
  return { ray, events, result };
}

/**
 * Small deterministic CPU diagnostic. These six box-facing probes are not a
 * renderer benchmark; they make relative traversal work visible and testable.
 */
export function measureTriangleBvh(bvh: TriangleBvh, triangles: readonly GpuTriangle[]): BvhProbeStats {
  if (bvh.nodes.length === 0) {
    return { rayCount: 0, hitCount: 0, averageNodeTests: 0, averageTriangleTests: 0, bruteForceTriangleTests: 0 };
  }
  const root = bvh.nodes[0]!;
  const center = root.boundsMin.clone().add(root.boundsMax).multiplyScalar(0.5);
  const extent = root.boundsMax.clone().sub(root.boundsMin);
  const distance = Math.max(extent.x, extent.y, extent.z, 1) * 2;
  const directions = [
    new THREE.Vector3(1, 0, 0), new THREE.Vector3(-1, 0, 0),
    new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, -1, 0),
    new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1),
  ];
  const results = directions.map((outward) => traverseTriangleBvh(bvh, triangles, {
    origin: center.clone().addScaledVector(outward, distance),
    direction: outward.clone().negate(),
  }));
  const total = (key: "nodeTests" | "triangleTests") =>
    results.reduce((sum, result) => sum + result[key], 0);
  return {
    rayCount: results.length,
    hitCount: results.filter((result) => result.triangleIndex >= 0).length,
    averageNodeTests: total("nodeTests") / results.length,
    averageTriangleTests: total("triangleTests") / results.length,
    bruteForceTriangleTests: triangles.length,
  };
}

export function hitTriangleDistance(
  triangle: GpuTriangle,
  ray: BvhRay,
  minDistance = 1e-4,
  maxDistance = Number.POSITIVE_INFINITY
): number | null {
  const edgeAB = triangle.b.clone().sub(triangle.a);
  const edgeAC = triangle.c.clone().sub(triangle.a);
  const p = new THREE.Vector3().crossVectors(ray.direction, edgeAC);
  const determinant = edgeAB.dot(p);
  if (Math.abs(determinant) < 1e-8) return null;
  const inverseDeterminant = 1 / determinant;
  const fromA = ray.origin.clone().sub(triangle.a);
  const baryB = fromA.dot(p) * inverseDeterminant;
  if (baryB < 0 || baryB > 1) return null;
  const q = new THREE.Vector3().crossVectors(fromA, edgeAB);
  const baryC = ray.direction.dot(q) * inverseDeterminant;
  if (baryC < 0 || baryB + baryC > 1) return null;
  const distance = edgeAC.dot(q) * inverseDeterminant;
  return distance > minDistance && distance < maxDistance ? distance : null;
}

function makeTriangleReference(triangle: GpuTriangle, index: number): TriangleReference {
  const boundsMin = triangle.a.clone().min(triangle.b).min(triangle.c);
  const boundsMax = triangle.a.clone().max(triangle.b).max(triangle.c);
  return {
    index,
    boundsMin,
    boundsMax,
    centroid: triangle.a.clone().add(triangle.b).add(triangle.c).multiplyScalar(1 / 3),
  };
}

function referenceBounds(items: readonly TriangleReference[]) {
  const min = new THREE.Vector3(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
  const max = new THREE.Vector3(Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY);
  items.forEach((item) => { min.min(item.boundsMin); max.max(item.boundsMax); });
  return { min, max };
}

function centroidReferenceBounds(items: readonly TriangleReference[]) {
  const min = new THREE.Vector3(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
  const max = new THREE.Vector3(Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY);
  items.forEach((item) => { min.min(item.centroid); max.max(item.centroid); });
  return { min, max };
}
