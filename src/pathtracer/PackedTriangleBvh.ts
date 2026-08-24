import * as THREE from "three";
import type { TriangleBvh } from "./TriangleBvh";

export interface PackedTriangleBvh {
  nodeTexture: THREE.DataTexture;
  nodeTextureSize: THREE.Vector2;
  indexTexture: THREE.DataTexture;
  indexTextureSize: THREE.Vector2;
  nodeCount: number;
}

const NODE_TEXELS = 2;

export function packTriangleBvh(bvh: TriangleBvh, maxTextureSize: number): PackedTriangleBvh {
  const nodes = createTexture(Math.max(1, bvh.nodes.length * NODE_TEXELS), maxTextureSize, "BVH node");
  bvh.nodes.forEach((node, index) => {
    const offset = index * NODE_TEXELS * 4;
    nodes.data.set([node.boundsMin.x, node.boundsMin.y, node.boundsMin.z, node.payload], offset);
    nodes.data.set([node.boundsMax.x, node.boundsMax.y, node.boundsMax.z, node.triangleCount], offset + 4);
  });
  const indices = createTexture(Math.max(1, bvh.triangleIndices.length), maxTextureSize, "BVH index");
  bvh.triangleIndices.forEach((triangleIndex, index) => { indices.data[index * 4] = triangleIndex; });
  return {
    nodeTexture: nodes.texture,
    nodeTextureSize: nodes.size,
    indexTexture: indices.texture,
    indexTextureSize: indices.size,
    nodeCount: bvh.nodes.length,
  };
}

function createTexture(texelCount: number, maxTextureSize: number, label: string) {
  const width = Math.min(maxTextureSize, texelCount);
  const height = Math.ceil(texelCount / width);
  if (height > maxTextureSize) throw new RangeError(`${label} texture capacity exceeded`);
  const data = new Float32Array(width * height * 4);
  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.FloatType);
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.flipY = false;
  texture.needsUpdate = true;
  return { texture, size: new THREE.Vector2(width, height), data };
}
