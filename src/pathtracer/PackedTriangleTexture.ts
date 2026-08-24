import * as THREE from "three";
import type { GpuTriangle } from "./GpuScene";

/** Eight RGBA32F texels per triangle. Integer IDs remain exact in this range. */
export const TRIANGLE_TEXELS = 8;

export interface PackedTriangleTexture {
  texture: THREE.DataTexture;
  size: THREE.Vector2;
  triangleCount: number;
}

export function packTriangleTexture(
  triangles: readonly GpuTriangle[],
  maxTextureSize: number
): PackedTriangleTexture {
  const texelCount = Math.max(1, triangles.length * TRIANGLE_TEXELS);
  const width = Math.min(maxTextureSize, texelCount);
  const height = Math.ceil(texelCount / width);
  if (height > maxTextureSize) {
    const capacity = Math.floor((maxTextureSize * maxTextureSize) / TRIANGLE_TEXELS);
    throw new RangeError(`Triangle texture capacity exceeded: ${triangles.length} triangles, maximum ${capacity}`);
  }
  const data = new Float32Array(width * height * 4);
  triangles.forEach((triangle, index) => writeTriangle(data, index, triangle));
  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.FloatType);
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.flipY = false;
  texture.needsUpdate = true;
  return { texture, size: new THREE.Vector2(width, height), triangleCount: triangles.length };
}

export function unpackTriangle(data: Float32Array, triangleIndex: number): GpuTriangle {
  const read = (texelOffset: number) => {
    const offset = (triangleIndex * TRIANGLE_TEXELS + texelOffset) * 4;
    return [data[offset]!, data[offset + 1]!, data[offset + 2]!, data[offset + 3]!] as const;
  };
  const a = read(0), b = read(1), c = read(2);
  const normalA = read(3), normalB = read(4), normalC = read(5);
  const uvAB = read(6), uvC = read(7);
  return {
    a: new THREE.Vector3(a[0], a[1], a[2]),
    b: new THREE.Vector3(b[0], b[1], b[2]),
    c: new THREE.Vector3(c[0], c[1], c[2]),
    normalA: new THREE.Vector3(normalA[0], normalA[1], normalA[2]),
    normalB: new THREE.Vector3(normalB[0], normalB[1], normalB[2]),
    normalC: new THREE.Vector3(normalC[0], normalC[1], normalC[2]),
    uvA: new THREE.Vector2(uvAB[0], uvAB[1]),
    uvB: new THREE.Vector2(uvAB[2], uvAB[3]),
    uvC: new THREE.Vector2(uvC[0], uvC[1]),
    materialId: Math.round(a[3]),
  };
}

function writeTriangle(data: Float32Array, triangleIndex: number, triangle: GpuTriangle) {
  const write = (texelOffset: number, x: number, y: number, z: number, w: number) => {
    data.set([x, y, z, w], (triangleIndex * TRIANGLE_TEXELS + texelOffset) * 4);
  };
  write(0, triangle.a.x, triangle.a.y, triangle.a.z, triangle.materialId);
  write(1, triangle.b.x, triangle.b.y, triangle.b.z, 0);
  write(2, triangle.c.x, triangle.c.y, triangle.c.z, 0);
  write(3, triangle.normalA.x, triangle.normalA.y, triangle.normalA.z, 0);
  write(4, triangle.normalB.x, triangle.normalB.y, triangle.normalB.z, 0);
  write(5, triangle.normalC.x, triangle.normalC.y, triangle.normalC.z, 0);
  write(6, triangle.uvA.x, triangle.uvA.y, triangle.uvB.x, triangle.uvB.y);
  write(7, triangle.uvC.x, triangle.uvC.y, 0, 0);
}
