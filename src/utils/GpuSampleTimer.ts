/** Optional diagnostic timer. Never substitutes CPU duration for GPU time. */
export class GpuSampleTimer {
  private gl: WebGL2RenderingContext;
  private extension: { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null;
  private pending: WebGLQuery[] = [];
  private active: WebGLQuery | null = null;
  private durations: number[] = [];
  private cpuDurations: number[] = [];
  private reason: string | null = null;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.extension = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    if (!this.extension) this.reason = 'timer-extension-unavailable';
  }

  begin() {
    if (this.reason || !this.extension) return;
    if (this.active) throw new Error('GPU sample timer already active.');
    if (this.pending.length >= 256) { this.invalidate('query-backlog-limit'); return; }
    if (this.gl.getQuery(this.extension.TIME_ELAPSED_EXT, this.gl.CURRENT_QUERY)) {
      this.invalidate('conflicting-timer-query'); return;
    }
    this.active = this.gl.createQuery();
    if (!this.active) { this.invalidate('query-allocation-failed'); return; }
    this.gl.beginQuery(this.extension.TIME_ELAPSED_EXT, this.active);
  }

  end() {
    if (!this.active || !this.extension) return;
    this.gl.endQuery(this.extension.TIME_ELAPSED_EXT);
    this.pending.push(this.active);
    this.active = null;
  }

  /** CPU wall time spent issuing this draw, including any driver stalls, not GPU duration. */
  measureCpuSubmission(draw: () => void, now: () => number = () => performance.now()) {
    const started = now();
    draw();
    this.cpuDurations.push(now() - started);
  }

  /** Call outside the measured draw; results remain pending until the GPU finishes. */
  poll() {
    if (this.reason || !this.extension) return this.snapshot();
    if (this.gl.isContextLost()) this.invalidate('context-lost');
    else if (this.gl.getParameter(this.extension.GPU_DISJOINT_EXT)) this.invalidate('gpu-disjoint');
    else {
      while (this.pending.length && this.gl.getQueryParameter(this.pending[0], this.gl.QUERY_RESULT_AVAILABLE)) {
        const query = this.pending.shift()!;
        const nanoseconds = this.gl.getQueryParameter(query, this.gl.QUERY_RESULT) as number;
        this.gl.deleteQuery(query);
        if (!Number.isFinite(nanoseconds) || nanoseconds < 0) { this.invalidate('invalid-query-result'); break; }
        this.durations.push(nanoseconds / 1e6);
      }
    }
    return this.snapshot();
  }

  private snapshot() {
    return { scope: 'path-trace-draw' as const, status: this.reason ? 'unavailable' as const : 'available' as const,
      reason: this.reason, pending: this.pending.length, gpuBatchMs: this.reason ? null : [...this.durations],
      cpuScope: 'renderer.render submission; excludes timer query setup and polling' as const,
      cpuSubmissionMs: [...this.cpuDurations] };
  }

  private invalidate(reason: string) {
    this.reason = reason;
    this.durations = [];
    this.releaseQueries();
  }

  private releaseQueries() {
    this.end();
    for (const query of this.pending) this.gl.deleteQuery(query);
    this.pending = [];
  }

  dispose() { this.invalidate('disposed'); }
}
