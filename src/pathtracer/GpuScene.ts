import type * as THREE from "three";
import type PtMaterial from "./PtMaterial";

export interface GpuSphere {
  position: THREE.Vector3;
  radius: number;
  materialId: number;
}

export default class GpuScene {
  public spheres: GpuSphere[];
  public materials: PtMaterial[];
  private disposed = false;

  constructor(spheres: GpuSphere[], materials: PtMaterial[]) {
    this.spheres = spheres;
    this.materials = materials;
  }

  public updateSpheres(spheres: GpuSphere[]) {
    this.assertUsable();
    this.spheres = spheres;
  }

  public updateMaterials(materials: PtMaterial[]) {
    this.assertUsable();
    this.materials = materials;
  }

  public dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.spheres = [];
    this.materials = [];
  }

  private assertUsable() {
    if (this.disposed) throw new Error("GpuScene has been disposed");
  }
}
