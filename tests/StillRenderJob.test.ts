import assert from "node:assert/strict";
import test from "node:test";
import { createStillRenderSnapshot } from "../src/pathtracer/StillRenderJob.ts";
import { createAuthoredCamera } from "../src/pathtracer/AuthoredCamera.ts";

test("still jobs freeze camera and output settings at submission", () => {
  const camera = createAuthoredCamera("Hero", {
    position: [1, 2, 3], quaternion: [0, 0, 0, 1], projection: "perspective", fov: 45,
    orthographicHeight: 4, depthOfField: false, aperture: 0, focusDistance: 5,
    outputWidth: 1920, outputHeight: 1080,
  }, "hero");
  const snapshot = createStillRenderSnapshot("Scene", 12, camera, {
    width: 2048, height: 1024, samples: 512, maxRayDepth: 12,
    accumulationFormat: "rgba32f", integratorMode: "mis",
    renderMode: "pathtraced", regionTracingMode: "roiOnly", comparisonTracingMode: "fullFrame",
    comparisonSeam: 0.5, region: [0.3, 0.3, 0.4, 0.4], selectedObjectIds: [],
  }, "backend", 123);
  camera.position[0] = 99;
  camera.outputWidth = 1;
  assert.deepEqual(snapshot.camera.position, [1, 2, 3]);
  assert.equal(snapshot.camera.outputWidth, 1920);
  assert.equal(snapshot.settings.width, 2048);
  assert.equal(snapshot.sceneRevision, 12);
});

test("still job numeric settings are safely bounded", () => {
  const camera = createAuthoredCamera("Camera", {
    position: [0, 0, 0], quaternion: [0, 0, 0, 1], projection: "perspective", fov: 75,
    orthographicHeight: 4, depthOfField: false, aperture: 0, focusDistance: 1,
    outputWidth: 1, outputHeight: 1,
  }, "camera");
  const snapshot = createStillRenderSnapshot("Scene", 0, camera, {
    width: 99999, height: -1, samples: 0, maxRayDepth: 1000,
    accumulationFormat: "rgba16f", integratorMode: "direct",
    renderMode: "pathtraced", regionTracingMode: "roiOnly", comparisonTracingMode: "fullFrame",
    comparisonSeam: 0.5, region: [0.3, 0.3, 0.4, 0.4], selectedObjectIds: [],
  }, "backend");
  assert.deepEqual(snapshot.settings, {
    width: 16384, height: 1, samples: 1, maxRayDepth: 100,
    accumulationFormat: "rgba16f", integratorMode: "direct",
    renderMode: "pathtraced", regionTracingMode: "roiOnly", comparisonTracingMode: "fullFrame",
    comparisonSeam: 0.5, region: [0.3, 0.3, 0.4, 0.4], selectedObjectIds: [],
  });
});
