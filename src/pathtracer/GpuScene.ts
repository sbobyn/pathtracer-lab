import type * as THREE from "three";
import type PtMaterial from "./PtMaterial";

export interface GpuSphere {
  position: THREE.Vector3;
  radius: number;
  materialId: number;
}

export enum GpuTextureType {
  Constant = 0,
  Checker = 1,
  Image = 2,
}

export interface GpuTexture {
  type: GpuTextureType;
  colorA: THREE.Color;
  colorB: THREE.Color;
  scale: number;
  imageId: number;
}

export interface GpuMaterial {
  type: PtMaterial["type"];
  textureId: number;
  fuzz: number;
  ior: number;
}

export default class GpuScene {
  public spheres: GpuSphere[];
  public materials: GpuMaterial[];
  public textures: GpuTexture[];
  private disposed = false;

  constructor(spheres: GpuSphere[], materials: GpuMaterial[], textures: GpuTexture[]) {
    this.spheres = spheres;
    this.materials = materials;
    this.textures = textures;
  }

  public updateSpheres(spheres: GpuSphere[]) {
    this.assertUsable();
    this.spheres = spheres;
  }

  public updateMaterials(materials: GpuMaterial[], textures: GpuTexture[]) {
    this.assertUsable();
    this.materials = materials;
    this.textures = textures;
  }

  public dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.spheres = [];
    this.materials = [];
    this.textures = [];
  }

  private assertUsable() {
    if (this.disposed) throw new Error("GpuScene has been disposed");
  }
}
