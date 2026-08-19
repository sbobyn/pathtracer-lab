import assert from "node:assert/strict";
import test from "node:test";
import { computeNumberScrubValue } from "../src/pathtracer/numberScrub.ts";

test("Shift makes numeric scrubbing ten times more precise", () => {
  const normal = computeNumberScrubValue(10, -10, 0.1, 1, false, false);
  const precise = computeNumberScrubValue(10, -10, 0.1, 1, true, false);

  assert.equal(normal, 10.5);
  assert.equal(precise, 10.05);
  assert.ok(Math.abs((normal - 10) / (precise - 10) - 10) < 1e-10);
});

test("precision can be engaged mid-drag without reinterpreting prior movement", () => {
  const afterNormalMove = computeNumberScrubValue(
    10,
    -10,
    0.1,
    1,
    false,
    false
  );
  const afterPreciseMove = computeNumberScrubValue(
    afterNormalMove,
    -10,
    0.1,
    1,
    true,
    false
  );

  assert.equal(afterNormalMove, 10.5);
  assert.equal(afterPreciseMove, 10.55);
});

test("Control or Command uses the configured coarse fixed increment", () => {
  assert.equal(
    computeNumberScrubValue(0.02, -3, 0.001, 0.01, false, true),
    0.04
  );
  assert.equal(computeNumberScrubValue(75, -3, 1, 5, false, true), 85);
});
