import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { compareLinearFrames } from '../src/pathtracer/ParityMetrics.ts';
import { canonicalParityJson } from '../src/pathtracer/ParityProvenance.ts';

export function readParityCapture(directory) {
  const metadata = JSON.parse(readFileSync(resolve(directory, 'capture.json'), 'utf8'));
  const raw = readFileSync(resolve(directory, 'linear.rgba32f'));
  if (!Number.isSafeInteger(metadata.width) || metadata.width < 1 || !Number.isSafeInteger(metadata.height) || metadata.height < 1 ||
      metadata.format !== 'float32-rgba' || !['little-endian','big-endian'].includes(metadata.byteOrder) ||
      raw.length !== metadata.width * metadata.height * 16) throw new Error('Invalid capture shape/format.');
  if (createHash('sha256').update(raw).digest('hex') !== metadata.rawSha256) throw new Error('Capture checksum mismatch.');
  const data = new Float32Array(raw.length / 4);
  for (let i = 0; i < data.length; i++) data[i] = metadata.byteOrder === 'little-endian' ? raw.readFloatLE(i * 4) : raw.readFloatBE(i * 4);
  if (!data.every(Number.isFinite)) throw new Error('Non-finite capture data.');
  return { metadata, data };
}

export function compareParityCaptures(reference, candidate) {
  const r = reference.metadata, c = candidate.metadata;
  for (const m of [r, c]) {
    if (!Number.isSafeInteger(m.batches) || m.batches < 1 || !Number.isSafeInteger(m.sequenceOffset) || m.sequenceOffset < 0 ||
        !Number.isSafeInteger(m.sequenceOffset + m.batches) || m.sequenceIndex !== m.sequenceOffset + m.batches ||
        m.settings?.numSamples !== 1) throw new Error('Invalid sample sequence metadata.');
    for (const key of ['sceneKey','logicalSceneSha256','baselineRevision','presetSourceSha256','rowOrder']) {
      if (!m[key]) throw new Error(`Missing capture metadata: ${key}`);
    }
  }
  for (const key of ['width','height','sceneKey','logicalSceneSha256','baselineRevision','presetSourceSha256','rowOrder']) {
    if (r[key] !== c[key]) throw new Error(`Incompatible captures: ${key}`);
  }
  const settings = m => Object.fromEntries(Object.entries(m.settings).filter(([key]) => key !== 'maxAccumulationFrames'));
  if (canonicalParityJson(settings(r)) !== canonicalParityJson(settings(c)) || canonicalParityJson(r.camera) !== canonicalParityJson(c.camera)) throw new Error('Incompatible camera/render settings.');
  const assets = m => (m.assets ?? []).map(a => `${a.sha256}:${a.bytes}`).sort();
  if (canonicalParityJson(assets(r)) !== canonicalParityJson(assets(c))) throw new Error('Incompatible asset bytes.');
  if (r.servedSourceSha256 && c.servedSourceSha256 && r.servedSourceSha256 !== c.servedSourceSha256) throw new Error('Incompatible served source snapshots.');
  const overlap = Math.max(r.sequenceOffset, c.sequenceOffset) < Math.min(r.sequenceOffset + r.batches, c.sequenceOffset + c.batches);
  const warnings = ['Single finite-sample reference, not ground truth or a certified convergence gate.',
    'Sequence offsets select deterministic subsequences; statistical independence has not been established.'];
  if (overlap) warnings.push('Sample ranges overlap: shared noise can artificially reduce measured error.');
  if (r.batches <= c.batches) warnings.push('Reference has no more samples than the candidate.');
  if (!r.servedSourceSha256 || !c.servedSourceSha256) warnings.push('Legacy capture lacks complete served-source provenance.');
  return { referenceSamples: r.batches, candidateSamples: c.batches, overlappingSampleRanges: overlap,
    metrics: compareLinearFrames(reference.data, candidate.data), warnings, certification: 'exploratory-only' };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [referencePath, ...candidatePaths] = process.argv.slice(2);
  if (!referencePath || !candidatePaths.length) throw new Error('Usage: node --experimental-strip-types scripts/parity-compare.mjs REFERENCE_DIR CANDIDATE_DIR...');
  const reference = readParityCapture(referencePath);
  console.log(JSON.stringify({ reference: resolve(referencePath), comparisons: candidatePaths.map(path => ({
    candidate: resolve(path), ...compareParityCaptures(reference, readParityCapture(path)),
  })) }, null, 2));
}
