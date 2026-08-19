import * as THREE from "three";
import type PtMaterial from "./PtMaterial";
import type { PtSphereUniform } from "./PtScene";

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
      spheres: PtSphereUniform[];
    };
  };
  uNumSamples: { value: number };
  uMaxRayDepth: { value: number };
  uMaterials: { value: PtMaterial[] };
  uBackgroundColorTop: { value: THREE.Color };
  uBackgroundColorBottom: { value: THREE.Color };
  uEnableDoF: { value: boolean };
}
