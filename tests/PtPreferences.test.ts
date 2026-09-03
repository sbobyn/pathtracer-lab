import assert from "node:assert/strict";
import test from "node:test";
import {
  clearPtPreferences,
  loadPtPreferences,
  preferenceSnapshot,
  PT_PREFERENCES_KEY,
  PT_PREFERENCES_VERSION,
  savePtPreferences,
} from "../src/pathtracer/PtPreferences.ts";
import { createDefaultPtState } from "../src/pathtracer/PtState.ts";

class MemoryStorage {
  value: string | null = null;
  writes = 0;
  getItem() { return this.value; }
  setItem(_key: string, value: string) { this.value = value; this.writes += 1; }
  removeItem() { this.value = null; }
}

test("loads valid versioned preferences over authoritative defaults", () => {
  const storage = new MemoryStorage();
  storage.value = JSON.stringify({
    version: PT_PREFERENCES_VERSION,
    sceneKey: "RTIOW1Final",
    settings: {
      numSamples: 8,
      renderMode: "comparison",
      fov: 60,
      cameraProjectionMode: "orthographic",
      orthographicHeight: 7.5,
      resolutionScale: 0.5,
      integratorMode: "mis",
      triangleTraversalMode: "bruteForce",
      triangleOverlayMode: "all",
      bvhOverlayEnabled: true,
      bvhOverlayDepth: 7,
      transformMode: "rotate",
      transformSpace: "local",
    },
  });
  const state = loadPtPreferences(storage, createDefaultPtState(), ["RTIOW1Simple", "RTIOW1Final"]);
  assert.equal(state.sceneKey, "RTIOW1Final");
  assert.equal(state.settings.numSamples, 8);
  assert.equal(state.settings.renderMode, "comparison");
  assert.equal(state.settings.fov, 60);
  assert.equal(state.settings.cameraProjectionMode, "orthographic");
  assert.equal(state.settings.orthographicHeight, 7.5);
  assert.equal(state.settings.resolutionScale, 0.5);
  assert.equal(state.settings.integratorMode, "mis");
  assert.equal(state.settings.triangleTraversalMode, "bruteForce");
  assert.equal(state.settings.triangleOverlayMode, "all");
  assert.equal(state.settings.bvhOverlayEnabled, true);
  assert.equal(state.settings.bvhOverlayDepth, 7);
  assert.equal(state.settings.transformMode, "rotate");
  assert.equal(state.settings.transformSpace, "local");
  assert.equal(state.settings.maxRayDepth, 10);
});

test("invalid, obsolete, and out-of-range data falls back safely", () => {
  const defaults = createDefaultPtState();
  const storage = new MemoryStorage();
  storage.value = JSON.stringify({
    version: PT_PREFERENCES_VERSION,
    sceneKey: "MissingScene",
    settings: {
      numSamples: "many",
      fov: 999,
      cameraProjectionMode: "fisheye",
      orthographicHeight: -4,
      integratorMode: "roulette",
      triangleTraversalMode: "octree",
      triangleOverlayMode: "vertices",
      bvhOverlayEnabled: "yes",
      bvhOverlayDepth: 200,
      backgroundColorTop: "blue",
    },
  });
  const state = loadPtPreferences(storage, defaults, ["RTIOW1Simple"]);
  assert.equal(state.sceneKey, defaults.sceneKey);
  assert.equal(state.settings.numSamples, defaults.settings.numSamples);
  assert.equal(state.settings.fov, 120);
  assert.equal(state.settings.cameraProjectionMode, defaults.settings.cameraProjectionMode);
  assert.equal(state.settings.orthographicHeight, 0.05);
  assert.equal(state.settings.integratorMode, defaults.settings.integratorMode);
  assert.equal(state.settings.triangleTraversalMode, defaults.settings.triangleTraversalMode);
  assert.equal(state.settings.triangleOverlayMode, defaults.settings.triangleOverlayMode);
  assert.equal(state.settings.bvhOverlayEnabled, defaults.settings.bvhOverlayEnabled);
  assert.equal(state.settings.bvhOverlayDepth, 64);
  assert.equal(state.settings.backgroundColorTop, defaults.settings.backgroundColorTop);

  storage.value = JSON.stringify({ version: 999, sceneKey: "RTIOW1Final" });
  assert.deepEqual(loadPtPreferences(storage, defaults, ["RTIOW1Simple", "RTIOW1Final"]), defaults);
  storage.value = "not json";
  assert.deepEqual(loadPtPreferences(storage, defaults, ["RTIOW1Simple"]), defaults);
});

test("v1 preferences migrate the triangle overlay to its hidden default", () => {
  const defaults = createDefaultPtState();
  const storage = new MemoryStorage();
  storage.value = JSON.stringify({
    version: 1,
    sceneKey: "RTIOW1Final",
    settings: {
      ...defaults.settings,
      triangleOverlayMode: "selected",
      numSamples: 7,
    },
  });

  const state = loadPtPreferences(storage, defaults, ["RTIOW1Simple", "RTIOW1Final"]);
  assert.equal(state.sceneKey, "RTIOW1Final");
  assert.equal(state.settings.numSamples, 7);
  assert.equal(state.settings.triangleOverlayMode, "off");
});

test("legacy path-tracing toggles migrate to the explicit render mode", () => {
  const defaults = createDefaultPtState();
  const storage = new MemoryStorage();
  storage.value = JSON.stringify({
    version: PT_PREFERENCES_VERSION,
    sceneKey: "RTIOW1Simple",
    settings: { pathtracingEnabled: false },
  });

  const raster = loadPtPreferences(storage, defaults, ["RTIOW1Simple"]);
  assert.equal(raster.settings.renderMode, "raster");

  storage.value = JSON.stringify({
    version: PT_PREFERENCES_VERSION,
    sceneKey: "RTIOW1Simple",
    settings: { pathtracingEnabled: true },
  });
  const pathtraced = loadPtPreferences(storage, defaults, ["RTIOW1Simple"]);
  assert.equal(pathtraced.settings.renderMode, "pathtraced");
});

test("the hybrid region render mode persists", () => {
  const defaults = createDefaultPtState();
  const storage = new MemoryStorage();
  storage.value = JSON.stringify({
    version: PT_PREFERENCES_VERSION,
    sceneKey: "RTIOW1Simple",
    settings: { renderMode: "region", regionTracingMode: "fullFrame" },
  });

  const state = loadPtPreferences(storage, defaults, ["RTIOW1Simple"]);
  assert.equal(state.settings.renderMode, "region");
  assert.equal(state.settings.regionTracingMode, "fullFrame");
});

test("the optimized seam tracing strategy persists", () => {
  const defaults = createDefaultPtState();
  const storage = new MemoryStorage();
  storage.value = JSON.stringify({
    version: PT_PREFERENCES_VERSION,
    sceneKey: "RTIOW1Simple",
    settings: {
      renderMode: "comparison",
      comparisonTracingMode: "pathtracedSide",
    },
  });

  const state = loadPtPreferences(storage, defaults, ["RTIOW1Simple"]);
  assert.equal(state.settings.renderMode, "comparison");
  assert.equal(state.settings.comparisonTracingMode, "pathtracedSide");
});

test("the selected-object comparison render mode persists", () => {
  const defaults = createDefaultPtState();
  const storage = new MemoryStorage();
  storage.value = JSON.stringify({
    version: PT_PREFERENCES_VERSION,
    sceneKey: "RTIOW1Simple",
    settings: {
      renderMode: "selectedObjectComparison",
      comparisonTracingMode: "fullFrame",
    },
  });

  const state = loadPtPreferences(storage, defaults, ["RTIOW1Simple"]);
  assert.equal(state.settings.renderMode, "selectedObjectComparison");
  assert.equal(state.settings.comparisonTracingMode, "fullFrame");
});

test("renamed RTIOW presets preserve existing saved scene selections", () => {
  const defaults = createDefaultPtState();
  const storage = new MemoryStorage();
  storage.value = JSON.stringify({
    version: PT_PREFERENCES_VERSION,
    sceneKey: "Part1Final",
    settings: defaults.settings,
  });

  const state = loadPtPreferences(storage, defaults, ["RTIOW1Simple", "RTIOW1Final"]);
  assert.equal(state.sceneKey, "RTIOW1Final");
});

test("the snapshot excludes selection, history, and scene object data", () => {
  const state = createDefaultPtState();
  state.selection.objectId = "selected";
  state.history.canUndo = true;
  state.sceneObjects.push({} as never);
  const snapshot = preferenceSnapshot(state);
  assert.deepEqual(Object.keys(snapshot).sort(), ["sceneKey", "settings", "version"]);
  assert.equal("selection" in snapshot, false);
  assert.equal("history" in snapshot, false);
  assert.equal("sceneObjects" in snapshot, false);
  assert.equal(PT_PREFERENCES_KEY, "three-pathtracer.preferences");
});

test("save writes one versioned record and clear removes it", () => {
  const storage = new MemoryStorage();
  const state = createDefaultPtState();
  state.settings.numSamples = 4;

  savePtPreferences(storage, state);
  assert.equal(storage.writes, 1);
  assert.equal(JSON.parse(storage.value ?? "").settings.numSamples, 4);

  clearPtPreferences(storage);
  assert.equal(storage.value, null);
});
