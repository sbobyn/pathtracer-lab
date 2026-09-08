import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readParityCapture, compareParityCaptures } from './parity-compare.mjs';
import { compareLinearFrames } from '../src/pathtracer/ParityMetrics.ts';
import { canonicalParityJson } from '../src/pathtracer/ParityProvenance.ts';

function summarize(values) {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const sampleStddev = Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1));
  return { mean, sampleStddev };
}

export function compareReferenceEnsemble(references, candidate) {
  if (references.length < 2) throw new Error('At least two references are required.');
  const samples = references[0].metadata.batches;
  for (let i = 0; i < references.length; i++) {
    if (references[i].metadata.batches !== samples) throw new Error('Reference sample budgets must match.');
    const comparison = compareParityCaptures(references[i], candidate);
    if (comparison.overlappingSampleRanges) throw new Error('Candidate overlaps a reference sample range.');
    for (let j = 0; j < i; j++) {
      if (compareParityCaptures(references[i], references[j]).overlappingSampleRanges) throw new Error('Reference sample ranges overlap.');
    }
  }
  const mean = new Float64Array(references[0].data.length);
  for (const reference of references) {
    for (let i = 0; i < mean.length; i++) mean[i] += reference.data[i] / references.length;
  }
  const referenceLuminances = references.map(reference => compareLinearFrames(reference.data, reference.data).meanReferenceLuminance);
  const luminance = summarize(referenceLuminances);
  const warnings = ['Non-overlapping deterministic subsequences are not proven independent RNG streams.',
    'Finite reference ensemble; no correctness or convergence certification.'];
  if (samples < 4096 || references.length < 4) warnings.push('Below the protocol reference budget of four 4096-sample captures.');
  if (samples <= candidate.metadata.batches) warnings.push('Individual references have no more samples than the candidate.');
  if (references.some(r => !r.metadata.servedSourceSha256) || !candidate.metadata.servedSourceSha256) warnings.push('Legacy captures lack served-source provenance.');
  const environments = new Set([...references, candidate].map(c => canonicalParityJson({browser: c.metadata.browser ?? null, device: c.metadata.device ?? null})));
  if (environments.size > 1) warnings.push('Browser/device records differ; this is not a controlled same-device comparison.');
  return { referenceCount: references.length, samplesPerReference: samples, candidateSamples: candidate.metadata.batches,
    metricsAgainstReferenceMean: compareLinearFrames(mean, candidate.data),
    referenceLuminance: { ...luminance, relativeSampleStddev: luminance.sampleStddev / Math.max(1e-6, Math.abs(luminance.mean)) },
    candidateNrmseAgainstIndividualReferences: summarize(references.map(r => compareLinearFrames(r.data, candidate.data).nrmse)),
    warnings, certification: 'exploratory-only' };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2), separator = args.indexOf('--candidates');
  if (args[0] !== '--references' || separator < 3 || separator === args.length - 1) throw new Error('Usage: node --experimental-strip-types scripts/parity-ensemble.mjs --references REF1 REF2... --candidates CAPTURE...');
  const paths = args.slice(1, separator);
  const references = paths.map(readParityCapture);
  console.log(JSON.stringify({ references: paths.map(path => resolve(path)), comparisons: args.slice(separator + 1).map(path => ({
    candidate: resolve(path), ...compareReferenceEnsemble(references, readParityCapture(path)),
  })) }, null, 2));
}
