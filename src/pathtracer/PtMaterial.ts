import * as THREE from "three";
import {
  constantTexture,
  texturePreviewColor,
  type PtTexture,
} from "./PtTexture.ts";

export const PtMaterialModel = {
  LegacyLambert: 0,
  LegacyFuzzyMetal: 1,
  LegacyDielectric: 2,
  NoBsdf: 3,
} as const;

export type PtMaterialModel = (typeof PtMaterialModel)[keyof typeof PtMaterialModel];

/** Compatibility names retained while existing scenes migrate to explicit models. */
export const PtMaterialType = {
  Lambert: PtMaterialModel.LegacyLambert,
  Metal: PtMaterialModel.LegacyFuzzyMetal,
  Dielectric: PtMaterialModel.LegacyDielectric,
  Emissive: PtMaterialModel.NoBsdf,
} as const;

export type PtMaterialType = (typeof PtMaterialType)[keyof typeof PtMaterialType];

export interface PtColorInput {
  factor: THREE.Color;
  texture: PtTexture;
}

export type PtColorSource = THREE.Color | PtTexture | PtColorInput;

export interface PtMaterialDefinition {
  model: PtMaterialModel;
  baseColor: PtColorInput;
  roughness: number;
  ior: number;
  emission: {
    color: PtColorInput;
    strength: number;
    twoSided: boolean;
  };
}

export interface PtMaterialOptions {
  model: PtMaterialModel;
  baseColor?: PtColorSource;
  roughness?: number;
  ior?: number;
  emissionColor?: PtColorSource;
  emissionStrength?: number;
  emissionTwoSided?: boolean;
}

export default class PtMaterial {
  public readonly definition: PtMaterialDefinition;

  public static legacyLambert(baseColor: PtColorSource) {
    return new PtMaterial({ model: PtMaterialModel.LegacyLambert, baseColor });
  }

  public static legacyFuzzyMetal(baseColor: PtColorSource, roughness = 0) {
    return new PtMaterial({
      model: PtMaterialModel.LegacyFuzzyMetal,
      baseColor,
      roughness,
    });
  }

  public static legacyDielectric(
    ior: number,
    baseColor: PtColorSource = new THREE.Color(1, 1, 1)
  ) {
    return new PtMaterial({
      model: PtMaterialModel.LegacyDielectric,
      baseColor,
      ior,
    });
  }

  public static emissive(
    colorOrTexture: PtColorSource,
    strength: number,
    twoSided = false
  ) {
    return new PtMaterial({
      model: PtMaterialModel.NoBsdf,
      baseColor: new THREE.Color(0, 0, 0),
      emissionColor: colorOrTexture,
      emissionStrength: strength,
      emissionTwoSided: twoSided,
    });
  }

  constructor(options: PtMaterialOptions);
  constructor(
    type: PtMaterialType,
    albedoOrTexture: THREE.Color | PtTexture,
    fuzz?: number,
    ior?: number,
    emissionStrength?: number,
    emissionTwoSided?: boolean
  );
  constructor(
    optionsOrType: PtMaterialOptions | PtMaterialType,
    albedoOrTexture?: THREE.Color | PtTexture,
    fuzz = 0,
    ior = 0,
    emissionStrength = 0,
    emissionTwoSided = false
  ) {
    const options: PtMaterialOptions = typeof optionsOrType === "number"
      ? {
          model: optionsOrType,
          baseColor: albedoOrTexture,
          roughness: fuzz,
          ior,
          emissionColor: optionsOrType === PtMaterialModel.NoBsdf ? albedoOrTexture : undefined,
          emissionStrength,
          emissionTwoSided,
        }
      : optionsOrType;
    this.definition = {
      model: options.model,
      baseColor: colorInput(options.baseColor ?? new THREE.Color(1, 1, 1)),
      roughness: options.roughness ?? 0,
      ior: options.ior ?? 0,
      emission: {
        color: colorInput(options.emissionColor ?? new THREE.Color(0, 0, 0)),
        strength: options.emissionStrength ?? 0,
        twoSided: options.emissionTwoSided ?? false,
      },
    };
  }

  public get type(): PtMaterialType {
    return this.definition.model;
  }

  /** Compatibility view used until SceneCompiler consumes structured inputs. */
  public get texture(): PtTexture {
    return this.definition.model === PtMaterialModel.NoBsdf
      ? this.definition.emission.color.texture
      : this.definition.baseColor.texture;
  }

  public get albedo(): THREE.Color {
    const input = this.definition.model === PtMaterialModel.NoBsdf
      ? this.definition.emission.color
      : this.definition.baseColor;
    return texturePreviewColor(input.texture).clone().multiply(input.factor);
  }

  public get fuzz(): number {
    return this.definition.roughness;
  }

  public get ior(): number {
    return this.definition.ior;
  }

  public get emissionStrength(): number {
    return this.definition.emission.strength;
  }

  public get emissionTwoSided(): boolean {
    return this.definition.emission.twoSided;
  }
}

function colorInput(source: PtColorSource): PtColorInput {
  if ("factor" in source && "texture" in source) {
    return { factor: source.factor.clone(), texture: source.texture };
  }
  const texture = source instanceof THREE.Color ? constantTexture(source) : source;
  return {
    factor: new THREE.Color(1, 1, 1),
    texture,
  };
}
