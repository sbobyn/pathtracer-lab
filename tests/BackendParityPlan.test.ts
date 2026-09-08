import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createParityPlan } from '../scripts/backend-parity-plan.mjs';

const manifest = JSON.parse(readFileSync(new URL('../docs/backend-parity.json', import.meta.url), 'utf8'));
test('parity plan pairs equal work and alternates backend order without inventing results', () => {
  const plan = createParityPlan(manifest);
  assert.equal(plan.length, 40);
  assert.deepEqual(plan.slice(0, 4).map(run => run.backend), ['webgl', 'webgpu', 'webgpu', 'webgl']);
  for (let i = 0; i < plan.length; i += 2) {
    assert.deepEqual(plan[i].settings, plan[i + 1].settings);
    assert.deepEqual(plan[i].camera, plan[i + 1].camera);
    assert.equal(plan[i].scene, plan[i + 1].scene);
    assert.equal(plan[i].status, 'not-run');
    assert.equal(plan[i].gpuTimeMs, null);
  }
});
test('invalid parity measurement windows and duplicate scenes are rejected', () => {
  assert.throws(() => createParityPlan({ ...manifest, measurement: { ...manifest.measurement, repetitions: 0 } }));
  assert.throws(() => createParityPlan({ ...manifest, scenes: [manifest.scenes[0], manifest.scenes[0]] }));
});
