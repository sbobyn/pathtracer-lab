export type AccumulationFormat = "rgba8" | "rgba16f" | "rgba32f";
export type TransformMode = "translate" | "scale";

/** Serializable render and camera preferences. */
export interface PtSettings {
  pathtracingEnabled: boolean;
  backgroundColorTop: string;
  backgroundColorBottom: string;
  fov: number;
  numSamples: number;
  maxRayDepth: number;
  resolutionScale: number;
  accumulationFormat: AccumulationFormat;
  maxAccumulationFrames: number;
  enableDepthOfField: boolean;
  aperture: number;
  focusDistance: number;
  transformMode: TransformMode;
}

/** Serializable editor selection; Three.js objects remain outside the store. */
export interface PtSelectionState {
  sphereIndex: number | null;
  position: { x: number; y: number; z: number };
  radius: number | null;
}

/** Serializable application state shared by UI adapters and application actions. */
export interface PtState {
  sceneKey: string;
  settings: PtSettings;
  selection: PtSelectionState;
}

const defaultSettings: Readonly<PtSettings> = Object.freeze({
  pathtracingEnabled: true,
  backgroundColorTop: "#bcdaff",
  backgroundColorBottom: "#ffffff",
  fov: 75,
  numSamples: 1,
  maxRayDepth: 10,
  resolutionScale: 1.0,
  accumulationFormat: "rgba32f",
  maxAccumulationFrames: 0,
  enableDepthOfField: false,
  aperture: 0.0,
  focusDistance: 1.0,
  transformMode: "translate",
});

export function createDefaultPtState(): PtState {
  return {
    sceneKey: "Part1Simple",
    settings: { ...defaultSettings },
    selection: {
      sphereIndex: null,
      position: { x: -1, y: -1, z: -1 },
      radius: null,
    },
  };
}
