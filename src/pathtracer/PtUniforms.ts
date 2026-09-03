import * as THREE from "three";
import type { GpuBox, GpuLight, GpuQuad } from "./GpuScene";

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
      orthographic: boolean;
      near: number;
    };
  };
  uWorld: {
    value: {
      quads: GpuQuad[];
      boxes: GpuBox[];
    };
  };
  uSphereCount: { value: number };
  uSphereData: { value: THREE.DataTexture };
  uSphereDataSize: { value: THREE.Vector2 };
  uSphereBvhNodeCount: { value: number };
  uSphereBvhNodeData: { value: THREE.DataTexture };
  uSphereBvhNodeDataSize: { value: THREE.Vector2 };
  uSphereBvhIndexData: { value: THREE.DataTexture };
  uSphereBvhIndexDataSize: { value: THREE.Vector2 };
  uQuadCount: { value: number };
  uBoxCount: { value: number };
  uTriangleCount: { value: number };
  uTriangleData: { value: THREE.DataTexture };
  uTriangleDataSize: { value: THREE.Vector2 };
  uBvhNodeCount: { value: number };
  uBvhNodeData: { value: THREE.DataTexture };
  uBvhNodeDataSize: { value: THREE.Vector2 };
  uBvhIndexData: { value: THREE.DataTexture };
  uBvhIndexDataSize: { value: THREE.Vector2 };
  uLights: { value: GpuLight[] };
  uLightCount: { value: number };
  uIntegratorMode: { value: number };
  uTriangleTraversalMode: { value: number };
  uNumSamples: { value: number };
  uMaxRayDepth: { value: number };
  uMaterialData: { value: THREE.DataTexture };
  uMaterialDataSize: { value: THREE.Vector2 };
  uTextureData: { value: THREE.DataTexture };
  uTextureDataSize: { value: THREE.Vector2 };
  uImageTexture0: { value: THREE.Texture };
  uImageTexture1: { value: THREE.Texture };
  uImageTexture2: { value: THREE.Texture };
  uImageTexture3: { value: THREE.Texture };
  uBackgroundColorTop: { value: THREE.Color };
  uBackgroundColorBottom: { value: THREE.Color };
  uEnvironmentMap: { value: THREE.Texture };
  uEnvironmentConditionalCdf: { value: THREE.Texture };
  uEnvironmentMarginalCdf: { value: THREE.Texture };
  uEnvironmentDistributionSize: { value: THREE.Vector2 };
  uEnvironmentEnabled: { value: boolean };
  uEnvironmentBackgroundVisible: { value: boolean };
  uEnvironmentLightingEnabled: { value: boolean };
  uEnvironmentRotation: { value: number };
  uEnvironmentIntensity: { value: number };
  uEnvironmentLightingIntensity: { value: number };
  uEnableDoF: { value: boolean };
  uObjectMaskEnabled: { value: boolean };
  uObjectMaskHasSelection: { value: boolean };
}
