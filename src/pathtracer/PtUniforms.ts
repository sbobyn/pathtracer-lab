import * as THREE from "three";
import type { GpuMaterial, GpuSphere, GpuTexture } from "./GpuScene";

export default interface PtUniforms {
  uCamera: {
    value: {
      position: THREE.Vector3;
      up: THREE.Vector3;
      forward: THREE.Vector3;
      right: THREE.Vector3;
      halfWidth: number;
      halfHeight: number;
      focusDistance: number;
      aperture: number;
    };
  };
  uWorld: {
    value: {
      spheres: GpuSphere[];
    };
  };
  uSphereCount: { value: number };
  uNumSamples: { value: number };
  uMaxRayDepth: { value: number };
  uMaterials: { value: GpuMaterial[] };
  uTextures: { value: GpuTexture[] };
  uImageTexture0: { value: THREE.Texture };
  uImageTexture1: { value: THREE.Texture };
  uImageTexture2: { value: THREE.Texture };
  uImageTexture3: { value: THREE.Texture };
  uBackgroundColorTop: { value: THREE.Color };
  uBackgroundColorBottom: { value: THREE.Color };
  uEnableDoF: { value: boolean };
}
