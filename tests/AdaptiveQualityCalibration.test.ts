import assert from "node:assert/strict";
import test from "node:test";
import {
  calibrationProgress,
  cancelCalibration,
  createCalibrationSession,
  finishWarmup,
  recordCalibrationTrial,
} from "../src/pathtracer/AdaptiveQualityCalibration.ts";

const fast60 = [11, 12, 12, 13, 12, 11, 13, 12, 12, 13];
const slow60 = [18, 19, 20, 18, 21, 19, 20, 18, 19, 20];

test("first-visit search raises resolution at one sample before samples", () => {
  let session = finishWarmup(createCalibrationSession({
    targetFps: 60,
    minimumResolutionScale: 0.25,
    maximumSamplesPerFrame: 4,
    resolutionSteps: [0.25, 0.5, 1],
    sampleSteps: [1, 2, 4],
  }));
  assert.deepEqual(session.candidate, { resolutionScale: 0.25, samplesPerFrame: 1 });
  session = recordCalibrationTrial(session, fast60);
  assert.deepEqual(session.candidate, { resolutionScale: 0.5, samplesPerFrame: 1 });
  session = recordCalibrationTrial(session, fast60);
  assert.deepEqual(session.candidate, { resolutionScale: 1, samplesPerFrame: 1 });
  session = recordCalibrationTrial(session, slow60);
  assert.equal(session.phase, "testingSamples");
  assert.deepEqual(session.candidate, { resolutionScale: 0.5, samplesPerFrame: 2 });
});

test("sample search returns to the highest passing count and validates it", () => {
  let session = finishWarmup(createCalibrationSession({
    targetFps: 60,
    minimumResolutionScale: 0.5,
    maximumSamplesPerFrame: 4,
    resolutionSteps: [0.5],
    sampleSteps: [1, 2, 4],
  }));
  session = recordCalibrationTrial(session, fast60);
  session = recordCalibrationTrial(session, fast60);
  assert.deepEqual(session.selected, { resolutionScale: 0.5, samplesPerFrame: 2 });
  session = recordCalibrationTrial(session, slow60);
  assert.equal(session.phase, "validating");
  assert.deepEqual(session.candidate, { resolutionScale: 0.5, samplesPerFrame: 2 });
  session = recordCalibrationTrial(session, fast60);
  assert.equal(session.phase, "complete");
  assert.match(session.reason, /Selected 0.5× resolution and 2 samples\/frame/);
});

test("a failed minimum-resolution baseline validates one sample without testing higher samples", () => {
  let session = finishWarmup(createCalibrationSession({
    targetFps: 60,
    minimumResolutionScale: 0.25,
    maximumSamplesPerFrame: 8,
    resolutionSteps: [0.25, 0.5],
    sampleSteps: [1, 2, 4, 8],
  }));
  session = recordCalibrationTrial(session, slow60);
  assert.equal(session.phase, "validating");
  assert.deepEqual(session.candidate, { resolutionScale: 0.25, samplesPerFrame: 1 });
});

test("failed validation lowers samples before resolution", () => {
  let session = finishWarmup(createCalibrationSession({
    targetFps: 60,
    minimumResolutionScale: 0.5,
    maximumSamplesPerFrame: 2,
    resolutionSteps: [0.5],
    sampleSteps: [1, 2],
  }));
  session = recordCalibrationTrial(session, fast60);
  session = recordCalibrationTrial(session, fast60);
  assert.equal(session.phase, "validating");
  assert.deepEqual(session.candidate, { resolutionScale: 0.5, samplesPerFrame: 2 });
  session = recordCalibrationTrial(session, slow60);
  assert.equal(session.phase, "validating");
  assert.deepEqual(session.candidate, { resolutionScale: 0.5, samplesPerFrame: 1 });
  session = recordCalibrationTrial(session, fast60);
  assert.equal(session.phase, "complete");
  assert.deepEqual(session.selected, { resolutionScale: 0.5, samplesPerFrame: 1 });
});

test("30 FPS target accepts frame times that fail a 60 FPS target", () => {
  const times = [24, 25, 26, 25, 24, 26, 25, 24, 26, 25];
  const config = {
    minimumResolutionScale: 0.5,
    maximumSamplesPerFrame: 1,
    resolutionSteps: [0.5, 1],
    sampleSteps: [1],
  } as const;
  const thirty = recordCalibrationTrial(
    finishWarmup(createCalibrationSession({ ...config, targetFps: 30 })),
    times
  );
  const sixty = recordCalibrationTrial(
    finishWarmup(createCalibrationSession({ ...config, targetFps: 60 })),
    times
  );
  assert.equal(thirty.measurements[0].passed, true);
  assert.equal(sixty.measurements[0].passed, false);
});

test("30 FPS keeps full resolution where 60 FPS selects half resolution", () => {
  const select = (targetFps: 30 | 60) => {
    let session = finishWarmup(createCalibrationSession({
      targetFps,
      minimumResolutionScale: 0.5,
      maximumSamplesPerFrame: 1,
      resolutionSteps: [0.5, 1],
      sampleSteps: [1],
    }));
    session = recordCalibrationTrial(session, fast60);
    session = recordCalibrationTrial(session, Array(10).fill(29));
    session = recordCalibrationTrial(session,
      Array(10).fill(session.candidate.resolutionScale === 1 ? 29 : 12));
    return session.selected;
  };
  assert.deepEqual(select(30), { resolutionScale: 1, samplesPerFrame: 1 });
  assert.deepEqual(select(60), { resolutionScale: 0.5, samplesPerFrame: 1 });
});

test("limits constrain the search ladder and progress remains determinate", () => {
  const session = createCalibrationSession({
    targetFps: 120,
    minimumResolutionScale: 0.5,
    maximumSamplesPerFrame: 4,
  });
  assert.deepEqual(session.resolutionSteps, [0.5, 1, 2]);
  assert.deepEqual(session.sampleSteps, [1, 2, 4]);
  assert.deepEqual(calibrationProgress(session), {
    completed: 0,
    maximum: 6,
    fraction: 0,
  });
});

test("cancelling preserves the selected candidate for manual use", () => {
  const session = cancelCalibration(finishWarmup(createCalibrationSession({
    targetFps: 90,
    minimumResolutionScale: 0.25,
    maximumSamplesPerFrame: 8,
  })));
  assert.equal(session.phase, "cancelled");
  assert.deepEqual(session.selected, { resolutionScale: 0.25, samplesPerFrame: 1 });
  assert.match(session.reason, /Manual quality settings remain authoritative/);
});

test("invalid measurement windows fail explicitly", () => {
  const session = finishWarmup(createCalibrationSession({
    targetFps: 60,
    minimumResolutionScale: 0.25,
    maximumSamplesPerFrame: 4,
  }));
  assert.throws(() => recordCalibrationTrial(session, [0, Number.NaN]), /positive finite frame times/);
});
