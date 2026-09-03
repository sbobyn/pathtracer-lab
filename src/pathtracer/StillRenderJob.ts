import type { AccumulationFormat, ComparisonTracingMode, IntegratorMode, RegionTracingMode, RenderMode } from "./PtState";
import type { AuthoredCamera } from "./AuthoredCamera";

export type StillRenderJobStatus = "queued" | "running" | "paused" | "canceling" | "completed" | "failed" | "canceled";

export interface StillRenderSettings {
  width: number;
  height: number;
  samples: number;
  maxRayDepth: number;
  accumulationFormat: AccumulationFormat;
  integratorMode: IntegratorMode;
  renderMode: RenderMode;
  regionTracingMode: RegionTracingMode;
  comparisonTracingMode: ComparisonTracingMode;
  comparisonSeam: number;
  region: [number, number, number, number];
  selectedObjectIds: string[];
}

export interface StillRenderSnapshot {
  sceneKey: string;
  sceneRevision: number;
  camera: AuthoredCamera;
  settings: StillRenderSettings;
  backendVersion: string;
  createdAt: number;
}

export interface StillRenderJob {
  id: string;
  status: StillRenderJobStatus;
  snapshot: StillRenderSnapshot;
  completedSamples: number;
  estimatedRemainingMs: number | null;
  renderDurationMs: number | null;
  previewUrl: string | null;
  resultUrl: string | null;
  error: string | null;
}

export function createStillRenderSnapshot(
  sceneKey: string,
  sceneRevision: number,
  camera: AuthoredCamera,
  settings: StillRenderSettings,
  backendVersion: string,
  createdAt = Date.now()
): StillRenderSnapshot {
  return {
    sceneKey,
    sceneRevision,
    camera: { ...camera, position: [...camera.position], quaternion: [...camera.quaternion] },
    settings: {
      width: clampInteger(settings.width, 1, 16384),
      height: clampInteger(settings.height, 1, 16384),
      samples: clampInteger(settings.samples, 1, 100000),
      maxRayDepth: clampInteger(settings.maxRayDepth, 1, 100),
      accumulationFormat: settings.accumulationFormat,
      integratorMode: settings.integratorMode,
      renderMode: settings.renderMode,
      regionTracingMode: settings.regionTracingMode,
      comparisonTracingMode: settings.comparisonTracingMode,
      comparisonSeam: Math.max(0, Math.min(1, settings.comparisonSeam)),
      region: [...settings.region],
      selectedObjectIds: [...settings.selectedObjectIds],
    },
    backendVersion,
    createdAt,
  };
}

function clampInteger(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, Math.round(value)));
}
