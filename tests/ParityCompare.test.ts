import test from 'node:test';
import assert from 'node:assert/strict';
import { compareParityCaptures, readParityCapture } from '../scripts/parity-compare.mjs';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

function capture(offset = 0, samples = 16) {
  return { metadata: { width: 1, height: 1, sceneKey: 'test', logicalSceneSha256: 'scene', baselineRevision: 'rev',
    presetSourceSha256: 'preset', servedSourceSha256: 'source', rowOrder: 'bottom-up', batches: samples,
    sequenceOffset: offset, sequenceIndex: offset + samples, settings: {numSamples: 1,maxAccumulationFrames: samples}, camera: [0,0,1], assets: [] },
    data: new Float32Array([2,2,2,1]) };
}

test('comparisons flag shared noise and retain finite reference limitations', () => {
  const shared = compareParityCaptures(capture(0,64), capture());
  assert.equal(shared.overlappingSampleRanges, true);
  assert.equal(shared.metrics.nrmse, 0);
  const separate = compareParityCaptures(capture(1000,64), capture());
  assert.equal(separate.overlappingSampleRanges, false);
  assert.equal(separate.certification, 'exploratory-only');
  assert.ok(separate.warnings.some(w => w.includes('independence')));
});

test('comparisons reject differing scenes, sources, cameras, or settings', () => {
  for (const key of ['width','logicalSceneSha256','servedSourceSha256','rowOrder']) {
    const candidate = capture();
    Object.assign(candidate.metadata, {[key]: 'different'});
    assert.throws(() => compareParityCaptures(capture(), candidate));
  }
  const candidate = capture(); candidate.metadata.camera = [1,0,1];
  assert.throws(() => compareParityCaptures(capture(),candidate));
  const invalid = capture(); invalid.metadata.sequenceIndex++;
  assert.throws(() => compareParityCaptures(capture(),invalid));
});

test('capture reader honors byte order and rejects corruption or non-finite data', t => {
  const directory = mkdtempSync(join(tmpdir(), 'parity-reader-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const raw = Buffer.alloc(16);
  [12,2,1,1].forEach((value, index) => raw.writeFloatBE(value, index * 4));
  const metadata = { width: 1, height: 1, format: 'float32-rgba', byteOrder: 'big-endian', rawSha256: '' };
  const save = () => {
    metadata.rawSha256 = createHash('sha256').update(raw).digest('hex');
    writeFileSync(join(directory,'capture.json'), JSON.stringify(metadata));
    writeFileSync(join(directory,'linear.rgba32f'),raw);
  };
  save();
  assert.deepEqual([...readParityCapture(directory).data], [12,2,1,1]);
  writeFileSync(join(directory,'linear.rgba32f'),Buffer.alloc(16));
  assert.throws(() => readParityCapture(directory), /checksum/);
  raw.writeFloatBE(NaN,0); save();
  assert.throws(() => readParityCapture(directory), /Non-finite/);
});
