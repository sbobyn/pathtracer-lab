export type AccumulationFormat = "rgba8" | "rgba16f" | "rgba32f";
export type TransformMode = "translate" | "scale";
export type PtMaterialKind = "Lambert" | "Metal" | "Dielectric" | "Unknown";

export interface PtSceneObjectState {
  id: string;
  label: string;
  kind: "scene" | "camera" | "light" | "group" | "sphere";
  parentId: string | null;
  depth: number;
  sphereIndex: number | null;
  selectable: boolean;
  traceable: boolean;
  capability: string;
}

export interface PtSelectionMaterialState {
  id: number;
  kind: PtMaterialKind;
  color: string;
  roughness: number | null;
  ior: number | null;
  texture: {
    type: "constant" | "checker" | "image" | "perlin";
    label: string;
    source: string | null;
    colorA: string | null;
    colorB: string | null;
    scale: number | null;
    turbulence: number | null;
  };
}

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
  objectId: string | null;
  name: string | null;
  sphereIndex: number | null;
  position: { x: number; y: number; z: number };
  radius: number | null;
  uvMapping: "spherical" | "box" | null;
  material: PtSelectionMaterialState | null;
}

/** Read-only editor history summary suitable for any UI adapter. */
export interface PtHistoryState {
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string | null;
  redoLabel: string | null;
}

/** Serializable application state shared by UI adapters and application actions. */
export interface PtState {
  sceneKey: string;
  sceneObjects: PtSceneObjectState[];
  settings: PtSettings;
  selection: PtSelectionState;
  history: PtHistoryState;
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
    sceneObjects: [],
    settings: { ...defaultSettings },
    selection: {
      objectId: null,
      name: null,
      sphereIndex: null,
      position: { x: -1, y: -1, z: -1 },
      radius: null,
      uvMapping: null,
      material: null,
    },
    history: {
      canUndo: false,
      canRedo: false,
      undoLabel: null,
      redoLabel: null,
    },
  };
}
