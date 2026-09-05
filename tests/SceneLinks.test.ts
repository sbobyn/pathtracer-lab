import assert from "node:assert/strict";
import test from "node:test";
import { createSceneLink, sceneFromSearch } from "../src/pathtracer/SceneLinks.ts";
import { createDefaultPtState } from "../src/pathtracer/PtState.ts";

test("scene links accept only exact known presets", () => {
  const keys = ["EmissiveStudy", "CornellBox"];
  assert.equal(sceneFromSearch("?scene=CornellBox", keys), "CornellBox");
  for (const search of ["", "?scene=unknown", "?scene=__proto__", "?scene=cornellbox"]) {
    assert.equal(sceneFromSearch(search, keys), null);
  }
});
test("scene links preserve the deployment base but exclude unrelated state", () => {
  assert.equal(createSceneLink("https://example.com/pathtracer-lab/?token=private#state", "CornellBox"),
    "https://example.com/pathtracer-lab/?scene=CornellBox");
  assert.equal(createSceneLink("https://example.com/", "EmissiveStudy"),
    "https://example.com/?scene=EmissiveStudy");
});
test("first visits start with MIS and the emissive study", () => {
  const state = createDefaultPtState();
  assert.equal(state.settings.integratorMode, "mis");
  assert.equal(state.sceneKey, "EmissiveStudy");
});
