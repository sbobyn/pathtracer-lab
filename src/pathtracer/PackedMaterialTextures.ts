import * as THREE from "three";
import type { GpuMaterial, GpuTexture } from "./GpuScene";

export const MATERIAL_TEXELS = 2;
export const TEXTURE_TEXELS = 3;

export interface PackedDataTexture {
  texture: THREE.DataTexture;
  size: THREE.Vector2;
}

export function packMaterialTexture(materials: readonly GpuMaterial[], maxTextureSize: number) {
  return packRecords(materials, MATERIAL_TEXELS, maxTextureSize, (data, base, material) => {
    data.set([material.type, material.textureId, material.fuzz, material.ior], base);
    data.set([material.emissionStrength, material.emissionTwoSided ? 1 : 0, 0, 0], base + 4);
  }, "Material");
}

export function packTextureTexture(textures: readonly GpuTexture[], maxTextureSize: number) {
  return packRecords(textures, TEXTURE_TEXELS, maxTextureSize, (data, base, texture) => {
    data.set([texture.type, texture.imageId, texture.scale, texture.turbulence], base);
    data.set([texture.colorA.r, texture.colorA.g, texture.colorA.b, 0], base + 4);
    data.set([texture.colorB.r, texture.colorB.g, texture.colorB.b, 0], base + 8);
  }, "Texture descriptor");
}

function packRecords<T>(
  records: readonly T[], texelsPerRecord: number, maxTextureSize: number,
  write: (data: Float32Array, base: number, record: T) => void,
  label: string
): PackedDataTexture {
  const texelCount = Math.max(1, records.length * texelsPerRecord);
  const width = Math.min(maxTextureSize, texelCount);
  const height = Math.ceil(texelCount / width);
  if (height > maxTextureSize) {
    const capacity = Math.floor((maxTextureSize * maxTextureSize) / texelsPerRecord);
    throw new RangeError(`${label} texture capacity exceeded: ${records.length} records, maximum ${capacity}`);
  }
  const data = new Float32Array(width * height * 4);
  records.forEach((record, index) => write(data, index * texelsPerRecord * 4, record));
  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.FloatType);
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.flipY = false;
  texture.needsUpdate = true;
  return { texture, size: new THREE.Vector2(width, height) };
}
