import * as THREE from "three";

export type AccumulationFormat = "rgba8" | "rgba16f" | "rgba32f";

export interface PtState {
  pathtracingEnabled: boolean;
  backgroundColorTop: THREE.Color;
  backgroundColorBottom: THREE.Color;
  fov: number;
  numSamples: number;
  maxRayDepth: number;
  resolutionScale: number;
  accumulationFormat: AccumulationFormat;
  maxAccumulationFrames: number;
  enableDepthOfField: boolean;
  aperture: number;
  focusDistance: number;
}

export const defaultState: PtState = {
  pathtracingEnabled: true,
  backgroundColorTop: new THREE.Color(0.7, 0.8, 1.0),
  backgroundColorBottom: new THREE.Color(1.0, 1.0, 1.0),
  fov: 20,
  numSamples: 1,
  maxRayDepth: 10,
  resolutionScale: 1.0,
  accumulationFormat: "rgba32f",
  maxAccumulationFrames: 0,
  enableDepthOfField: false,
  aperture: 0.0,
  focusDistance: 1.0,
};
