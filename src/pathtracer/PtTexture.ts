import * as THREE from "three";

export enum PtTextureType {
  Constant = 0,
  Checker = 1,
  Image = 2,
}

export type PtTexture =
  | { type: PtTextureType.Constant; color: THREE.Color }
  | {
      type: PtTextureType.Checker;
      colorA: THREE.Color;
      colorB: THREE.Color;
      scale: number;
    }
  | { type: PtTextureType.Image; source: string };

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

export function imageTexture(source: string): PtTexture {
  return { type: PtTextureType.Image, source };
}

export function texturePreviewColor(texture: PtTexture) {
  if (texture.type === PtTextureType.Constant) return texture.color;
  if (texture.type === PtTextureType.Checker) return texture.colorA;
  return new THREE.Color(0xffffff);
}
