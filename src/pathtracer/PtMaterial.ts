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
  Emissive = 3,
}

export default class PtMaterial {
  public readonly texture: PtTexture;
  public readonly albedo: THREE.Color;

  public static emissive(
    colorOrTexture: THREE.Color | PtTexture,
    strength: number,
    twoSided = false
  ) {
    return new PtMaterial(
      PtMaterialType.Emissive,
      colorOrTexture,
      0,
      0,
      strength,
      twoSided
    );
  }

  constructor(
    public type: PtMaterialType,
    albedoOrTexture: THREE.Color | PtTexture,
    public fuzz: number = 0,
    public ior: number = 0,
    public emissionStrength: number = 0,
    public emissionTwoSided: boolean = false
  ) {
    this.texture =
      albedoOrTexture instanceof THREE.Color
        ? constantTexture(albedoOrTexture)
        : albedoOrTexture;
    this.albedo = texturePreviewColor(this.texture).clone();
  }
}
