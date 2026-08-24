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
    sceneKey: "Part1Final",
    settings: {
      numSamples: 8,
      fov: 60,
      resolutionScale: 0.5,
      integratorMode: "mis",
      triangleTraversalMode: "bruteForce",
      transformMode: "rotate",
      transformSpace: "local",
    },
  });
  const state = loadPtPreferences(storage, createDefaultPtState(), ["Part1Simple", "Part1Final"]);
  assert.equal(state.sceneKey, "Part1Final");
  assert.equal(state.settings.numSamples, 8);
  assert.equal(state.settings.fov, 60);
  assert.equal(state.settings.resolutionScale, 0.5);
  assert.equal(state.settings.integratorMode, "mis");
  assert.equal(state.settings.triangleTraversalMode, "bruteForce");
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
      integratorMode: "roulette",
      triangleTraversalMode: "octree",
      backgroundColorTop: "blue",
    },
  });
  const state = loadPtPreferences(storage, defaults, ["Part1Simple"]);
  assert.equal(state.sceneKey, defaults.sceneKey);
  assert.equal(state.settings.numSamples, defaults.settings.numSamples);
  assert.equal(state.settings.fov, 120);
  assert.equal(state.settings.integratorMode, defaults.settings.integratorMode);
  assert.equal(state.settings.triangleTraversalMode, defaults.settings.triangleTraversalMode);
  assert.equal(state.settings.backgroundColorTop, defaults.settings.backgroundColorTop);

  storage.value = JSON.stringify({ version: 999, sceneKey: "Part1Final" });
  assert.deepEqual(loadPtPreferences(storage, defaults, ["Part1Simple", "Part1Final"]), defaults);
  storage.value = "not json";
  assert.deepEqual(loadPtPreferences(storage, defaults, ["Part1Simple"]), defaults);
});

test("the snapshot excludes selection, history, and scene object data", () => {
  const state = createDefaultPtState();
  state.selection.objectId = "selected";
  state.history.canUndo = true;
  state.sceneObjects.push({} as never);
  const snapshot = preferenceSnapshot(state);
  assert.deepEqual(Object.keys(snapshot).sort(), ["sceneKey", "settings", "version"]);
  assert.equal(JSON.stringify(snapshot).includes("selected"), false);
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
