import * as THREE from "three";
import {
  constantTexture,
  texturePreviewColor,
  type PtTexture,
} from "./PtTexture";

export enum PtMaterialType {
  Lambert = 0,
  Metal = 1,
  Dielectric = 2,
}

export default class PtMaterial {
  public readonly texture: PtTexture;
  public readonly albedo: THREE.Color;

  constructor(
    public type: PtMaterialType,
    albedoOrTexture: THREE.Color | PtTexture,
    public fuzz: number = 0,
    public ior: number = 0
  ) {
    this.texture =
      albedoOrTexture instanceof THREE.Color
        ? constantTexture(albedoOrTexture)
        : albedoOrTexture;
    this.albedo = texturePreviewColor(this.texture).clone();
  }
}
