import test from 'node:test';
import assert from 'node:assert/strict';
import { GpuSampleTimer } from '../src/utils/GpuSampleTimer.ts';

function fixture(supported = true) {
  const state = { ready: false, disjoint: false, lost: false, deleted: 0, ended: 0 };
  const gl = {
    CURRENT_QUERY: 1, QUERY_RESULT_AVAILABLE: 2, QUERY_RESULT: 3,
    getExtension: () => supported ? { TIME_ELAPSED_EXT: 4, GPU_DISJOINT_EXT: 5 } : null,
    getQuery: () => null, createQuery: () => ({}), beginQuery: () => {},
    endQuery: () => state.ended++, deleteQuery: () => state.deleted++,
    isContextLost: () => state.lost, getParameter: () => state.disjoint,
    getQueryParameter: (_query: unknown, kind: number) => kind === 2 ? state.ready : 2500000,
  } as unknown as WebGL2RenderingContext;
  return { state, timer: new GpuSampleTimer(gl) };
}

test('unsupported timing remains unavailable, never zero milliseconds', () => {
  const { timer } = fixture(false);
  timer.begin(); timer.end();
  assert.equal(timer.poll().gpuBatchMs, null);
  assert.equal(timer.poll().reason, 'timer-extension-unavailable');
});

test('CPU submission timing remains distinct and works without GPU query support', () => {
  const { timer } = fixture(false);
  let clock = 10;
  timer.measureCpuSubmission(() => { clock = 12.5; }, () => clock);
  assert.deepEqual(timer.poll().cpuSubmissionMs, [2.5]);
  assert.equal(timer.poll().gpuBatchMs, null);
  assert.throws(() => timer.measureCpuSubmission(() => { throw new Error('draw failed'); }, () => clock));
  assert.equal(timer.poll().cpuSubmissionMs.length, 1);
});

test('queries are asynchronous and nanoseconds convert to milliseconds', () => {
  const { timer, state } = fixture();
  timer.begin(); assert.throws(() => timer.begin()); timer.end();
  assert.equal(timer.poll().pending, 1);
  assert.deepEqual(timer.poll().gpuBatchMs, []);
  state.ready = true;
  assert.deepEqual(timer.poll().gpuBatchMs, [2.5]);
  assert.equal(state.deleted, 1);
});

test('disjoint invalidates earlier samples and deletes pending queries', () => {
  const { timer, state } = fixture();
  state.ready = true; timer.begin(); timer.end(); timer.poll();
  timer.begin(); timer.end(); state.disjoint = true;
  assert.equal(timer.poll().reason, 'gpu-disjoint');
  assert.equal(timer.poll().gpuBatchMs, null);
  assert.equal(state.deleted, 2);
});

test('backlog is bounded and disposal ends an active query', () => {
  const { timer, state } = fixture();
  for (let i = 0; i < 256; i++) { timer.begin(); timer.end(); }
  timer.begin();
  assert.equal(timer.poll().reason, 'query-backlog-limit');
  assert.equal(state.deleted, 256);
  const active = fixture(); active.timer.begin(); active.timer.dispose();
  assert.equal(active.state.ended, 1);
  assert.equal(active.state.deleted, 1);
});

test('context loss discards measurements and cannot resume a partial run', () => {
  const { timer, state } = fixture();
  timer.begin(); timer.end(); state.lost = true;
  assert.equal(timer.poll().reason, 'context-lost');
  assert.equal(state.deleted, 1);
  state.lost = false; timer.begin(); timer.end();
  assert.equal(timer.poll().gpuBatchMs, null);
  assert.equal(timer.poll().pending, 0);
});
