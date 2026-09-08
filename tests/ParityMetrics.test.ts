import test from 'node:test';
import assert from 'node:assert/strict';
import { compareLinearFrames } from '../src/pathtracer/ParityMetrics.ts';

test('identical HDR RGB yields zero error regardless of alpha', () => {
  const result = compareLinearFrames(new Float32Array([4, 2, 1, 1]), new Float32Array([4, 2, 1, 0]));
  assert.equal(result.nrmse, 0);
  assert.equal(result.relativeLuminanceBias, 0);
});
test('known exposure error is detected without clipping HDR values', () => {
  const result = compareLinearFrames(new Float32Array([2, 2, 2, 1]), new Float32Array([4, 4, 4, 1]));
  assert.equal(result.rmse, 2);
  assert.equal(result.nrmse, 1);
  assert.equal(result.relativeLuminanceBias, 1);
});
test('black reference stays finite and invalid buffers fail', () => {
  assert.equal(compareLinearFrames(new Float32Array(4), new Float32Array(4)).nrmse, 0);
  assert.throws(() => compareLinearFrames(new Float32Array(), new Float32Array()));
  assert.throws(() => compareLinearFrames(new Float32Array(4), new Float32Array(8)));
  assert.throws(() => compareLinearFrames(new Float32Array(4), new Float32Array([NaN, 0, 0, 1])));
});
