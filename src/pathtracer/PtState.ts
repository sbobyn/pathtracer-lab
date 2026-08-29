export type AccumulationFormat = "rgba8" | "rgba16f" | "rgba32f";
export type TransformMode = "translate" | "rotate" | "scale";
export type TransformSpace = "global" | "local";
export type IntegratorMode = "bsdf" | "direct" | "mis";
export type RenderMode = "raster" | "pathtraced" | "comparison" | "region";
export type RegionTracingMode = "fullFrame" | "roiOnly";
export type ComparisonTracingMode = "fullFrame" | "pathtracedSide";
export type TriangleTraversalMode = "bvh" | "bruteForce";
export type TriangleOverlayMode = "off" | "selected" | "all";
export type PtMaterialKind = "Lambert" | "Metal" | "Dielectric" | "Emissive" | "Principled" | "Unknown";

export interface PtTextureState {
  enabled: boolean;
  type: "constant" | "checker" | "image" | "perlin";
  label: string;
  source: string | null;
  colorA: string | null;
  colorB: string | null;
  scale: number | null;
  turbulence: number | null;
}

export interface PtSceneObjectState {
  id: string;
  label: string;
  kind: "scene" | "camera" | "light" | "group" | "sphere" | "quad" | "triangleMesh";
  parentId: string | null;
  depth: number;
  sphereIndex: number | null;
  quadIndex: number | null;
  selectable: boolean;
  traceable: boolean;
  capability: string;
  /** Present only for authored analytic lights, for hierarchy quick controls. */
  lightEnabled?: boolean;
}

export interface PtSelectionMaterialState {
  id: number;
  kind: PtMaterialKind;
  color: string;
  roughness: number | null;
  metallic: number | null;
  ior: number | null;
  emissionColor: string | null;
  emissionStrength: number | null;
  emissionTwoSided: boolean | null;
  texture: PtTextureState;
  metallicRoughnessTexture: PtTextureState | null;
  emissionTexture: PtTextureState | null;
}

/** Serializable render and camera preferences. */
export interface PtSettings {
  renderMode: RenderMode;
  regionTracingMode: RegionTracingMode;
  comparisonTracingMode: ComparisonTracingMode;
  environmentMode: "gradient" | "map";
  environmentSource: string;
  environmentLabel: string;
  environmentRotation: number;
  environmentIntensity: number;
  environmentLightingIntensity: number;
  environmentBackgroundVisible: boolean;
  environmentLightingEnabled: boolean;
  backgroundColorTop: string;
  backgroundColorBottom: string;
  fov: number;
  numSamples: number;
  maxRayDepth: number;
  integratorMode: IntegratorMode;
  triangleTraversalMode: TriangleTraversalMode;
  triangleOverlayMode: TriangleOverlayMode;
  bvhOverlayEnabled: boolean;
  bvhOverlayDepth: number;
  resolutionScale: number;
  accumulationFormat: AccumulationFormat;
  maxAccumulationFrames: number;
  enableDepthOfField: boolean;
  aperture: number;
  focusDistance: number;
  transformMode: TransformMode;
  transformSpace: TransformSpace;
}

/** Serializable editor selection; Three.js objects remain outside the store. */
export interface PtSelectionState {
  objectId: string | null;
  name: string | null;
  sphereIndex: number | null;
  quadIndex: number | null;
  kind: "sphere" | "quad" | "triangleMesh" | "pointLight" | "directionalLight" | "spotLight" | null;
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  radius: number | null;
  width: number | null;
  height: number | null;
  uvMapping: "spherical" | "box" | null;
  mesh: {
    triangleCount: number;
    vertexCount: number;
    indexed: boolean;
    wireframeVisible: boolean;
  } | null;
  material: PtSelectionMaterialState | null;
  light: {
    type: "point" | "directional" | "spot";
    enabled: boolean;
    color: string;
    intensity: number;
    angularDiameter: number;
    innerConeAngle: number;
    outerConeAngle: number;
  } | null;
}

/** Read-only editor history summary suitable for any UI adapter. */
export interface PtHistoryState {
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string | null;
  redoLabel: string | null;
}

export interface PtBvhTraversalState {
  armed: boolean;
  step: number;
  rayOrigin: [number, number, number] | null;
  rayDirection: [number, number, number] | null;
  events: Array<
    | { kind: "node"; geometryKind: "triangle" | "sphere"; nodeIndex: number; hit: boolean; leaf: boolean }
    | { kind: "triangle"; geometryKind: "triangle"; nodeIndex: number; triangleIndex: number; distance: number | null; closest: boolean }
    | { kind: "sphere"; geometryKind: "sphere"; nodeIndex: number; sphereIndex: number; distance: number | null; closest: boolean }
  >;
  result: {
    geometryKind: "triangle" | "sphere" | null;
    primitiveIndex: number;
    distance: number | null;
    nodeTests: number;
    primitiveTests: number;
    agreesWithBruteForce: boolean;
  } | null;
}

/** Serializable application state shared by UI adapters and application actions. */
export interface PtState {
  sceneKey: string;
  sceneObjects: PtSceneObjectState[];
  importWarnings: string[];
  settings: PtSettings;
  selection: PtSelectionState;
  history: PtHistoryState;
  bvhTraversal: PtBvhTraversalState;
}

const defaultSettings: Readonly<PtSettings> = Object.freeze({
  renderMode: "pathtraced",
  regionTracingMode: "roiOnly",
  comparisonTracingMode: "fullFrame",
  environmentMode: "gradient",
  environmentSource: "",
  environmentLabel: "Gradient",
  environmentRotation: 0,
  environmentIntensity: 1,
  environmentLightingIntensity: 1,
  environmentBackgroundVisible: true,
  environmentLightingEnabled: true,
  backgroundColorTop: "#bcdaff",
  backgroundColorBottom: "#ffffff",
  fov: 75,
  numSamples: 1,
  maxRayDepth: 10,
  integratorMode: "bsdf",
  triangleTraversalMode: "bvh",
  triangleOverlayMode: "off",
  bvhOverlayEnabled: false,
  bvhOverlayDepth: 0,
  resolutionScale: 1.0,
  accumulationFormat: "rgba32f",
  maxAccumulationFrames: 0,
  enableDepthOfField: false,
  aperture: 0.0,
  focusDistance: 1.0,
  transformMode: "translate",
  transformSpace: "global",
});

export function createDefaultPtState(): PtState {
  return {
    sceneKey: "RTIOW1Simple",
    sceneObjects: [],
    importWarnings: [],
    settings: { ...defaultSettings },
    selection: {
      objectId: null,
      name: null,
      sphereIndex: null,
      quadIndex: null,
      kind: null,
      position: { x: -1, y: -1, z: -1 },
      rotation: { x: 0, y: 0, z: 0 },
      radius: null,
      width: null,
      height: null,
      uvMapping: null,
      mesh: null,
      material: null,
      light: null,
    },
    history: {
      canUndo: false,
      canRedo: false,
      undoLabel: null,
      redoLabel: null,
    },
    bvhTraversal: {
      armed: false,
      step: -1,
      rayOrigin: null,
      rayDirection: null,
      events: [],
      result: null,
    },
  };
}
