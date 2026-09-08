/** Nearest-rank percentiles; null means there were no measurements. */
export function summarizeDurations(values: readonly number[]) {
  if (values.some(value => !Number.isFinite(value) || value < 0)) throw new Error('Invalid timing duration.');
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = (p: number) => sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)];
  return { count: sorted.length, medianMs: rank(0.5), p95Ms: rank(0.95) };
}

export function validateMeasurementWindows(windowSeconds: number, repetitions: number) {
  if (!Number.isFinite(windowSeconds) || windowSeconds <= 0 || windowSeconds > 60) throw new Error('Measurement window must be in (0, 60] seconds.');
  if (!Number.isSafeInteger(repetitions) || repetitions < 1 || repetitions > 20) throw new Error('Measurement repetitions must be in [1, 20].');
}
