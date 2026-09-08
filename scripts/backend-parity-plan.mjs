import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export function createParityPlan(manifest) {
  if (manifest.version !== 1 || !manifest.scenes?.length) throw new Error('Unsupported parity manifest');
  const { repetitions, warmupSeconds, windowSeconds } = manifest.measurement;
  if (!Number.isInteger(repetitions) || repetitions < 1 || warmupSeconds <= 0 || windowSeconds <= 0) {
    throw new Error('Invalid measurement windows');
  }
  if (new Set(manifest.scenes.map(scene => scene.key)).size !== manifest.scenes.length) throw new Error('Duplicate scene');
  return manifest.scenes.flatMap(scene => Array.from({ length: repetitions }, (_, repetition) =>
    (repetition % 2 ? ['webgpu', 'webgl'] : ['webgl', 'webgpu']).map(backend => ({
      manifestVersion: manifest.version, baselineRevision: manifest.baselineRevision,
      scene: scene.key, backend, repetition: repetition + 1,
      camera: scene.camera, settings: manifest.settings, warmupSeconds, windowSeconds,
      status: 'not-run', gpuTimeMs: null, pixelSamplesPerSecond: null,
    }))
  ).flat());
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const manifest = JSON.parse(readFileSync(new URL('../docs/backend-parity.json', import.meta.url), 'utf8'));
  console.log(JSON.stringify(createParityPlan(manifest), null, 2));
}
