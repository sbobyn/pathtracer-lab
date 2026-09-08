import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeDurations, validateMeasurementWindows } from '../src/pathtracer/ParityTiming.ts';

test('timing summaries use nearest-rank percentiles without mutating samples', () => {
  const values = [4, 1, 3, 2];
  assert.deepEqual(summarizeDurations(values), { count: 4, medianMs: 2, p95Ms: 4 });
  assert.deepEqual(values, [4, 1, 3, 2]);
  assert.equal(summarizeDurations([]), null);
  for (const value of [NaN, Infinity, -1]) assert.throws(() => summarizeDurations([value]));
});

test('measurement windows reject invalid and unbounded requests', () => {
  validateMeasurementWindows(10, 5);
  for (const seconds of [0, -1, NaN, Infinity, 61]) assert.throws(() => validateMeasurementWindows(seconds, 5));
  for (const repetitions of [0, 1.5, NaN, 21]) assert.throws(() => validateMeasurementWindows(10, repetitions));
});
