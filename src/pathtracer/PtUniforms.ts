import * as THREE from "three";
import type { GpuLight, GpuMaterial, GpuQuad, GpuSphere, GpuTexture, GpuTriangle } from "./GpuScene";

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
      quads: GpuQuad[];
      triangles: GpuTriangle[];
    };
  };
  uSphereCount: { value: number };
  uQuadCount: { value: number };
  uTriangleCount: { value: number };
  uLights: { value: GpuLight[] };
  uLightCount: { value: number };
  uIntegratorMode: { value: number };
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
  uEnvironmentMap: { value: THREE.Texture };
  uEnvironmentEnabled: { value: boolean };
  uEnvironmentBackgroundVisible: { value: boolean };
  uEnvironmentLightingEnabled: { value: boolean };
  uEnvironmentRotation: { value: number };
  uEnvironmentIntensity: { value: number };
  uEnableDoF: { value: boolean };
}
