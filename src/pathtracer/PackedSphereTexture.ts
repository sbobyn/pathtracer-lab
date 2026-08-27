import * as THREE from "three";
import type { GpuSphere } from "./GpuScene";

export interface PackedSphereTexture {
  texture: THREE.DataTexture;
  size: THREE.Vector2;
}

const SPHERE_TEXELS = 2;

export function packSphereTexture(
  spheres: readonly GpuSphere[],
  maxTextureSize: number
): PackedSphereTexture {
  const texelCount = Math.max(1, spheres.length * SPHERE_TEXELS);
  const width = Math.min(maxTextureSize, texelCount);
  const height = Math.ceil(texelCount / width);
  if (height > maxTextureSize) throw new RangeError("Sphere texture capacity exceeded");

  const data = new Float32Array(width * height * 4);
  spheres.forEach((sphere, index) => {
    const offset = index * SPHERE_TEXELS * 4;
    data.set([
      sphere.position.x,
      sphere.position.y,
      sphere.position.z,
      sphere.radius,
      sphere.materialId,
      sphere.uvMapping,
      0,
      0,
    ], offset);
  });

  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.FloatType);
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.flipY = false;
  texture.needsUpdate = true;
  return { texture, size: new THREE.Vector2(width, height) };
}
