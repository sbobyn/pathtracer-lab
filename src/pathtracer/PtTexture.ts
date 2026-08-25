import * as THREE from "three";

export enum PtTextureType {
  Constant = 0,
  Checker = 1,
  Image = 2,
  Perlin = 3,
}

export type PtTexture =
  | { type: PtTextureType.Constant; color: THREE.Color }
  | {
      type: PtTextureType.Checker;
      colorA: THREE.Color;
      colorB: THREE.Color;
      scale: number;
    }
  | {
      type: PtTextureType.Image;
      source: string;
      tint: THREE.Color;
      runtimeTexture?: THREE.Texture;
    }
  | {
      type: PtTextureType.Perlin;
      colorA: THREE.Color;
      colorB: THREE.Color;
      scale: number;
      turbulence: number;
    };

export function constantTexture(color: THREE.ColorRepresentation): PtTexture {
  return { type: PtTextureType.Constant, color: new THREE.Color(color) };
}

export function checkerTexture(
  colorA: THREE.ColorRepresentation,
  colorB: THREE.ColorRepresentation,
  scale = 10
): PtTexture {
  return {
    type: PtTextureType.Checker,
    colorA: new THREE.Color(colorA),
    colorB: new THREE.Color(colorB),
    scale,
  };
}

export function imageTexture(
  source: string,
  tint: THREE.ColorRepresentation = 0xffffff,
  runtimeTexture?: THREE.Texture
): PtTexture {
  return { type: PtTextureType.Image, source, tint: new THREE.Color(tint), runtimeTexture };
}

export function perlinTexture(
  colorA: THREE.ColorRepresentation = 0x101820,
  colorB: THREE.ColorRepresentation = 0xe8dcc4,
  scale = 4,
  turbulence = 10
): PtTexture {
  return { type: PtTextureType.Perlin, colorA: new THREE.Color(colorA), colorB: new THREE.Color(colorB), scale, turbulence };
}

export function cloneTexture(texture: PtTexture): PtTexture {
  if (texture.type === PtTextureType.Constant) return constantTexture(texture.color);
  if (texture.type === PtTextureType.Checker) {
    return checkerTexture(texture.colorA, texture.colorB, texture.scale);
  }
  if (texture.type === PtTextureType.Perlin) {
    return perlinTexture(texture.colorA, texture.colorB, texture.scale, texture.turbulence);
  }
  return imageTexture(texture.source, texture.tint, texture.runtimeTexture);
}

export function texturePreviewColor(texture: PtTexture) {
  if (texture.type === PtTextureType.Constant) return texture.color;
  if (texture.type === PtTextureType.Checker) return texture.colorA;
  if (texture.type === PtTextureType.Perlin) return texture.colorA;
  return texture.tint;
}
