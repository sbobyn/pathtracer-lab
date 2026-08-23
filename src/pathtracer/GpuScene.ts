import type * as THREE from "three";
import type PtMaterial from "./PtMaterial";

export interface GpuSphere {
  position: THREE.Vector3;
  radius: number;
  materialId: number;
  uvMapping: number;
}

export interface GpuQuad {
  q: THREE.Vector3;
  u: THREE.Vector3;
  v: THREE.Vector3;
  normal: THREE.Vector3;
  materialId: number;
}

export enum GpuTextureType {
  Constant = 0,
  Checker = 1,
  Image = 2,
  Perlin = 3,
}

export interface GpuTexture {
  type: GpuTextureType;
  colorA: THREE.Color;
  colorB: THREE.Color;
  scale: number;
  turbulence: number;
  imageId: number;
}

export interface GpuMaterial {
  type: PtMaterial["type"];
  textureId: number;
  fuzz: number;
  ior: number;
  emissionStrength: number;
  emissionTwoSided: boolean;
}

export interface GpuLight {
  primitiveType: "sphere" | "quad";
  primitiveIndex: number;
  materialId: number;
  area: number;
  emissionTwoSided: boolean;
}

export default class GpuScene {
  public spheres: GpuSphere[];
  public quads: GpuQuad[];
  public materials: GpuMaterial[];
  public textures: GpuTexture[];
  public imageTextures: THREE.Texture[];
  public lights: GpuLight[];
  private disposed = false;

  constructor(
    spheres: GpuSphere[],
    quads: GpuQuad[],
    materials: GpuMaterial[],
    textures: GpuTexture[],
    imageTextures: THREE.Texture[],
    lights: GpuLight[]
  ) {
    this.spheres = spheres;
    this.quads = quads;
    this.materials = materials;
    this.textures = textures;
    this.imageTextures = imageTextures;
    this.lights = lights;
  }

  public updateSpheres(spheres: GpuSphere[]) {
    this.assertUsable();
    this.spheres = spheres;
  }

  public updateQuads(quads: GpuQuad[]) {
    this.assertUsable();
    this.quads = quads;
  }

  public updateMaterials(
    materials: GpuMaterial[],
    textures: GpuTexture[],
    imageTextures: THREE.Texture[]
  ) {
    this.assertUsable();
    this.materials = materials;
    this.textures = textures;
    this.imageTextures = imageTextures;
  }

  public updateLights(lights: GpuLight[]) {
    this.assertUsable();
    this.lights = lights;
  }

  public dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.spheres = [];
    this.quads = [];
    this.materials = [];
    this.textures = [];
    this.imageTextures = [];
    this.lights = [];
  }

  private assertUsable() {
    if (this.disposed) throw new Error("GpuScene has been disposed");
  }
}
