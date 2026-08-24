import type { PtSettings, PtState } from "./PtState";

const builtinEnvironmentAssetNames = [
  "studio_small_03_2k",
  "meadow_2k",
  "belfast_sunset_puresky_2k",
  "relax_inn_seaview_suite_4k",
] as const;

function isBuiltinEnvironmentSource(source: string) {
  return builtinEnvironmentAssetNames.some((assetName) => source.includes(assetName));
}

export const PT_PREFERENCES_KEY = "three-pathtracer.preferences";
export const PT_PREFERENCES_VERSION = 1;

export interface PtPreferenceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface PtPreferencesV1 {
  version: 1;
  sceneKey: string;
  settings: PtSettings;
}

const accumulationFormats = new Set(["rgba8", "rgba16f", "rgba32f"]);
const transformModes = new Set(["translate", "rotate", "scale"]);
const transformSpaces = new Set(["global", "local"]);
const integratorModes = new Set(["bsdf", "direct", "mis"]);
const triangleTraversalModes = new Set(["bvh", "bruteForce"]);
const resolutionScales = new Set([2, 1, 0.5, 0.25, 0.125, 0.0625]);
const environmentModes = new Set(["gradient", "map"]);
const colorPattern = /^#[0-9a-f]{6}$/i;

function finiteNumber(value: unknown, minimum: number, maximum: number) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(maximum, Math.max(minimum, value))
    : undefined;
}

function integer(value: unknown, minimum: number, maximum: number) {
  const number = finiteNumber(value, minimum, maximum);
  return number === undefined ? undefined : Math.round(number);
}

function validatedSettings(value: unknown, defaults: PtSettings): PtSettings {
  if (!value || typeof value !== "object") return { ...defaults };
  const candidate = value as Record<string, unknown>;
  const settings = { ...defaults };

  if (typeof candidate.pathtracingEnabled === "boolean") settings.pathtracingEnabled = candidate.pathtracingEnabled;
  if (environmentModes.has(candidate.environmentMode as string)) settings.environmentMode = candidate.environmentMode as PtSettings["environmentMode"];
  if (
    typeof candidate.environmentSource === "string" &&
    isBuiltinEnvironmentSource(candidate.environmentSource)
  ) settings.environmentSource = candidate.environmentSource;
  if (typeof candidate.environmentLabel === "string") settings.environmentLabel = candidate.environmentLabel;
  if (settings.environmentMode === "map" && !settings.environmentSource) {
    // Browser object URLs are session-local and cannot be restored after a
    // refresh. Uploaded environments intentionally fall back to the gradient;
    // built-in asset URLs remain persistable.
    settings.environmentMode = "gradient";
    settings.environmentLabel = "Gradient";
  }
  settings.environmentRotation = finiteNumber(candidate.environmentRotation, -360, 360) ?? settings.environmentRotation;
  settings.environmentIntensity = finiteNumber(candidate.environmentIntensity, 0, 20) ?? settings.environmentIntensity;
  if (typeof candidate.environmentBackgroundVisible === "boolean") settings.environmentBackgroundVisible = candidate.environmentBackgroundVisible;
  if (typeof candidate.environmentLightingEnabled === "boolean") settings.environmentLightingEnabled = candidate.environmentLightingEnabled;
  if (typeof candidate.backgroundColorTop === "string" && colorPattern.test(candidate.backgroundColorTop)) settings.backgroundColorTop = candidate.backgroundColorTop;
  if (typeof candidate.backgroundColorBottom === "string" && colorPattern.test(candidate.backgroundColorBottom)) settings.backgroundColorBottom = candidate.backgroundColorBottom;
  settings.fov = finiteNumber(candidate.fov, 10, 120) ?? settings.fov;
  settings.numSamples = integer(candidate.numSamples, 1, 20) ?? settings.numSamples;
  settings.maxRayDepth = integer(candidate.maxRayDepth, 1, 20) ?? settings.maxRayDepth;
  if (integratorModes.has(candidate.integratorMode as string)) settings.integratorMode = candidate.integratorMode as PtSettings["integratorMode"];
  if (triangleTraversalModes.has(candidate.triangleTraversalMode as string)) settings.triangleTraversalMode = candidate.triangleTraversalMode as PtSettings["triangleTraversalMode"];
  if (resolutionScales.has(candidate.resolutionScale as number)) settings.resolutionScale = candidate.resolutionScale as number;
  if (accumulationFormats.has(candidate.accumulationFormat as string)) settings.accumulationFormat = candidate.accumulationFormat as PtSettings["accumulationFormat"];
  settings.maxAccumulationFrames = integer(candidate.maxAccumulationFrames, 0, 100000) ?? settings.maxAccumulationFrames;
  if (typeof candidate.enableDepthOfField === "boolean") settings.enableDepthOfField = candidate.enableDepthOfField;
  settings.aperture = finiteNumber(candidate.aperture, 0, 0.1) ?? settings.aperture;
  settings.focusDistance = finiteNumber(candidate.focusDistance, 0.1, 20) ?? settings.focusDistance;
  if (transformModes.has(candidate.transformMode as string)) settings.transformMode = candidate.transformMode as PtSettings["transformMode"];
  if (transformSpaces.has(candidate.transformSpace as string)) settings.transformSpace = candidate.transformSpace as PtSettings["transformSpace"];
  return settings;
}

export function preferenceSnapshot(state: Readonly<PtState>): PtPreferencesV1 {
  return {
    version: PT_PREFERENCES_VERSION,
    sceneKey: state.sceneKey,
    settings: { ...state.settings },
  };
}

export function loadPtPreferences(
  storage: PtPreferenceStorage,
  defaults: PtState,
  validSceneKeys: readonly string[]
): PtState {
  try {
    const raw = storage.getItem(PT_PREFERENCES_KEY);
    if (!raw) return defaults;
    const candidate = JSON.parse(raw) as Record<string, unknown>;
    if (candidate.version !== PT_PREFERENCES_VERSION) return defaults;
    return {
      ...defaults,
      sceneKey:
        typeof candidate.sceneKey === "string" && validSceneKeys.includes(candidate.sceneKey)
          ? candidate.sceneKey
          : defaults.sceneKey,
      settings: validatedSettings(candidate.settings, defaults.settings),
    };
  } catch {
    return defaults;
  }
}

export function savePtPreferences(storage: PtPreferenceStorage, state: Readonly<PtState>) {
  storage.setItem(PT_PREFERENCES_KEY, JSON.stringify(preferenceSnapshot(state)));
}

export function clearPtPreferences(storage: PtPreferenceStorage) {
  storage.removeItem(PT_PREFERENCES_KEY);
}
