import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ADAPTIVE_QUALITY_PROFILES_KEY,
  adaptiveQualityProfileKey,
  loadAdaptiveQualityProfile,
  saveAdaptiveQualityProfile,
} from "../src/pathtracer/AdaptiveQualityProfiles.ts";

function memoryStorage(initial: string | null = null) {
  let value = initial;
  return {
    getItem: () => value,
    setItem: (_key: string, next: string) => { value = next; },
  };
}

const context = {
  sceneKey: "PrincipledMaterialStudy",
  backend: "webgl" as const,
  targetFps: 60 as const,
  viewportWidth: 1512,
  viewportHeight: 982,
  devicePixelRatio: 2,
  renderer: "ANGLE (Apple, Apple M3)",
};

describe("adaptive quality profiles", () => {
  it("uses stable coarse viewport and DPR buckets", () => {
    assert.equal(
      adaptiveQualityProfileKey({ ...context, viewportWidth: 1500, viewportHeight: 970 }),
      adaptiveQualityProfileKey(context)
    );
    assert.notEqual(adaptiveQualityProfileKey({ ...context, targetFps: 30 }), adaptiveQualityProfileKey(context));
  });

  it("round trips a profile", () => {
    const storage = memoryStorage();
    const profile = {
      resolutionScale: 0.5,
      samples: 4,
      medianFrameTimeMs: 14,
      p90FrameTimeMs: 16,
      measuredAt: 1234,
    };
    saveAdaptiveQualityProfile(storage, context, profile);
    assert.deepEqual(loadAdaptiveQualityProfile(storage, context), profile);
  });

  it("ignores corrupt and incompatible storage", () => {
    assert.equal(loadAdaptiveQualityProfile(memoryStorage("not json"), context), null);
    const storage = memoryStorage(JSON.stringify({ version: 99, profiles: {} }));
    assert.equal(loadAdaptiveQualityProfile(storage, context), null);
    assert.match(ADAPTIVE_QUALITY_PROFILES_KEY, /adaptive-quality/);
  });
});
