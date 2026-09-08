import test from 'node:test';
import assert from 'node:assert/strict';
import { compareReferenceEnsemble } from '../scripts/parity-ensemble.mjs';

function capture(offset: number, value: number) {
  return { metadata: { width: 1, height: 1, sceneKey: 'test', logicalSceneSha256: 'scene', baselineRevision: 'rev',
    presetSourceSha256: 'preset', servedSourceSha256: 'source', rowOrder: 'bottom-up', batches: 16,
    sequenceOffset: offset, sequenceIndex: offset + 16, settings: {numSamples: 1}, camera: [0,0,1], assets: [] },
    data: new Float32Array([value,value,value,1]) };
}

test('ensemble compares against the mean and reports sample variability', () => {
  const result = compareReferenceEnsemble([capture(100,1),capture(200,3)],capture(0,2));
  assert.equal(result.metricsAgainstReferenceMean.nrmse,0);
  assert.ok(Math.abs(result.referenceLuminance.mean - 2) < 1e-12);
  assert.ok(Math.abs(result.referenceLuminance.sampleStddev - Math.sqrt(2)) < 1e-12);
  assert.equal(result.certification,'exploratory-only');
});

test('ensembles reject shared reference noise and candidate overlap', () => {
  assert.throws(() => compareReferenceEnsemble([capture(100,1)],capture(0,2)));
  assert.throws(() => compareReferenceEnsemble([capture(100,1),capture(100,2)],capture(0,2)), /overlap/);
  assert.throws(() => compareReferenceEnsemble([capture(100,1),capture(200,2)],capture(105,2)), /overlap/);
});

test('ensembles reject unequal reference budgets', () => {
  const longer = capture(200,2);
  longer.metadata.batches = 32; longer.metadata.sequenceIndex = 232;
  assert.throws(() => compareReferenceEnsemble([capture(100,1),longer],capture(0,2)), /budgets/);
});
