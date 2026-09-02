import type { CalibrationTargetFps } from "./AdaptiveQualityCalibration";

export const ADAPTIVE_QUALITY_PROFILES_KEY = "three-pathtracer.adaptive-quality-profiles";
export const ADAPTIVE_QUALITY_PROFILES_VERSION = 1;

export interface AdaptiveQualityProfileContext {
  sceneKey: string;
  backend: "webgl";
  targetFps: CalibrationTargetFps;
  viewportWidth: number;
  viewportHeight: number;
  devicePixelRatio: number;
  renderer: string;
}

export interface AdaptiveQualityProfile {
  resolutionScale: number;
  samples: number;
  medianFrameTimeMs: number;
  p90FrameTimeMs: number;
  measuredAt: number;
}

export interface AdaptiveQualityProfileStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

interface StoredProfiles {
  version: 1;
  profiles: Record<string, AdaptiveQualityProfile>;
}

function bucket(value: number, size: number) {
  return Math.max(size, Math.round(value / size) * size);
}

export function adaptiveQualityProfileKey(context: AdaptiveQualityProfileContext) {
  const renderer = context.renderer.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 96);
  const dpr = Math.round(Math.max(0.5, Math.min(4, context.devicePixelRatio)) * 4) / 4;
  return [
    context.sceneKey,
    context.backend,
    `${context.targetFps}fps`,
    `${bucket(context.viewportWidth, 320)}x${bucket(context.viewportHeight, 180)}`,
    `${dpr}dpr`,
    renderer,
  ].join("|");
}

function validProfile(value: unknown): value is AdaptiveQualityProfile {
  if (!value || typeof value !== "object") return false;
  const profile = value as Record<string, unknown>;
  return typeof profile.resolutionScale === "number" && profile.resolutionScale > 0 &&
    typeof profile.samples === "number" && Number.isInteger(profile.samples) && profile.samples > 0 &&
    typeof profile.medianFrameTimeMs === "number" && profile.medianFrameTimeMs > 0 &&
    typeof profile.p90FrameTimeMs === "number" && profile.p90FrameTimeMs > 0 &&
    typeof profile.measuredAt === "number" && Number.isFinite(profile.measuredAt);
}

function readProfiles(storage: AdaptiveQualityProfileStorage): StoredProfiles {
  try {
    const parsed = JSON.parse(storage.getItem(ADAPTIVE_QUALITY_PROFILES_KEY) ?? "null") as unknown;
    if (!parsed || typeof parsed !== "object") throw new Error("missing");
    const candidate = parsed as Record<string, unknown>;
    if (candidate.version !== ADAPTIVE_QUALITY_PROFILES_VERSION || !candidate.profiles || typeof candidate.profiles !== "object") {
      throw new Error("version");
    }
    const profiles: Record<string, AdaptiveQualityProfile> = {};
    for (const [key, value] of Object.entries(candidate.profiles as Record<string, unknown>)) {
      if (validProfile(value)) profiles[key] = value;
    }
    return { version: ADAPTIVE_QUALITY_PROFILES_VERSION, profiles };
  } catch {
    return { version: ADAPTIVE_QUALITY_PROFILES_VERSION, profiles: {} };
  }
}

export function loadAdaptiveQualityProfile(
  storage: AdaptiveQualityProfileStorage,
  context: AdaptiveQualityProfileContext
) {
  return readProfiles(storage).profiles[adaptiveQualityProfileKey(context)] ?? null;
}

export function saveAdaptiveQualityProfile(
  storage: AdaptiveQualityProfileStorage,
  context: AdaptiveQualityProfileContext,
  profile: AdaptiveQualityProfile
) {
  const stored = readProfiles(storage);
  stored.profiles[adaptiveQualityProfileKey(context)] = profile;
  storage.setItem(ADAPTIVE_QUALITY_PROFILES_KEY, JSON.stringify(stored));
}
