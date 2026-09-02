export type CalibrationTargetFps = 30 | 60 | 90 | 120;
export type CalibrationPhase =
  | "warmingUp"
  | "testingResolution"
  | "testingSamples"
  | "validating"
  | "complete"
  | "cancelled";

export interface CalibrationCandidate {
  resolutionScale: number;
  samplesPerFrame: number;
}

export interface CalibrationMeasurement {
  candidate: CalibrationCandidate;
  medianFrameTimeMs: number;
  p90FrameTimeMs: number;
  measuredFps: number;
  passed: boolean;
  phase: "testingResolution" | "testingSamples" | "validating";
}

export interface CalibrationConfig {
  targetFps: CalibrationTargetFps;
  minimumResolutionScale: number;
  maximumSamplesPerFrame: number;
  resolutionSteps?: readonly number[];
  sampleSteps?: readonly number[];
}

export interface CalibrationSession {
  phase: CalibrationPhase;
  targetFps: CalibrationTargetFps;
  candidate: CalibrationCandidate;
  selected: CalibrationCandidate;
  resolutionSteps: number[];
  sampleSteps: number[];
  resolutionIndex: number;
  sampleIndex: number;
  completedTests: number;
  maximumTests: number;
  measurements: CalibrationMeasurement[];
  status: string;
  reason: string;
}

const DEFAULT_RESOLUTION_STEPS = [0.0625, 0.125, 0.25, 0.5, 1, 2] as const;
const DEFAULT_SAMPLE_STEPS = [1, 2, 4, 8, 12, 16, 20] as const;

export function createCalibrationSession(config: CalibrationConfig): CalibrationSession {
  const resolutionSteps = normalizedSteps(
    config.resolutionSteps ?? DEFAULT_RESOLUTION_STEPS,
    config.minimumResolutionScale
  );
  const sampleSteps = normalizedSteps(
    config.sampleSteps ?? DEFAULT_SAMPLE_STEPS,
    1,
    Math.max(1, Math.round(config.maximumSamplesPerFrame))
  );
  const candidate = { resolutionScale: resolutionSteps[0], samplesPerFrame: 1 };
  return {
    phase: "warmingUp",
    targetFps: config.targetFps,
    candidate,
    selected: { ...candidate },
    resolutionSteps,
    sampleSteps,
    resolutionIndex: 0,
    sampleIndex: Math.max(0, sampleSteps.indexOf(1)),
    completedTests: 0,
    maximumTests: resolutionSteps.length + Math.max(0, sampleSteps.length - 1) + 1,
    measurements: [],
    status: "Preparing the renderer",
    reason: "Loading resources and discarding warm-up frames before measurement.",
  };
}

export function finishWarmup(session: CalibrationSession): CalibrationSession {
  if (session.phase !== "warmingUp") return session;
  return {
    ...session,
    phase: "testingResolution",
    status: candidateStatus("Testing resolution", session.candidate),
    reason: "Finding the highest resolution that comfortably meets the target at one sample per frame.",
  };
}

export function recordCalibrationTrial(
  session: CalibrationSession,
  frameTimesMs: readonly number[]
): CalibrationSession {
  if (
    session.phase !== "testingResolution" &&
    session.phase !== "testingSamples" &&
    session.phase !== "validating"
  ) return session;
  const statistics = frameTimeStatistics(frameTimesMs);
  const budget = 1000 / session.targetFps;
  const passed = statistics.median <= budget * 0.92 && statistics.p90 <= budget * 1.08;
  const measurement: CalibrationMeasurement = {
    candidate: { ...session.candidate },
    medianFrameTimeMs: statistics.median,
    p90FrameTimeMs: statistics.p90,
    measuredFps: 1000 / Math.max(statistics.median, 1e-6),
    passed,
    phase: session.phase,
  };
  const next = {
    ...session,
    completedTests: session.completedTests + 1,
    measurements: [...session.measurements, measurement],
  };

  if (session.phase === "validating") {
    return {
      ...next,
      phase: "complete",
      selected: { ...session.candidate },
      status: "Calibration complete",
      reason: passed
        ? finalReason(session.candidate, measurement, session.targetFps)
        : `Selected conservative settings after validation measured ${Math.round(measurement.measuredFps)} FPS.`,
    };
  }

  if (session.phase === "testingResolution") {
    const hasHigherResolution = session.resolutionIndex + 1 < session.resolutionSteps.length;
    if (passed) next.selected = { ...session.candidate };
    if (passed && hasHigherResolution) {
      const resolutionIndex = session.resolutionIndex + 1;
      const candidate = {
        resolutionScale: session.resolutionSteps[resolutionIndex],
        samplesPerFrame: 1,
      };
      return {
        ...next,
        resolutionIndex,
        candidate,
        status: candidateStatus("Testing next resolution", candidate),
        reason: `Previous test passed at ${Math.round(measurement.measuredFps)} FPS.`,
      };
    }
    const selectedResolution = passed
      ? session.candidate.resolutionScale
      : next.selected.resolutionScale;
    const nextSampleIndex = session.sampleSteps.findIndex((samples) => samples > 1);
    if (nextSampleIndex >= 0) {
      const candidate = {
        resolutionScale: selectedResolution,
        samplesPerFrame: session.sampleSteps[nextSampleIndex],
      };
      return {
        ...next,
        phase: "testingSamples",
        sampleIndex: nextSampleIndex,
        selected: { resolutionScale: selectedResolution, samplesPerFrame: 1 },
        candidate,
        status: candidateStatus("Resolution selected; testing samples", candidate),
        reason: passed
          ? "The highest resolution passed. Spending remaining frame budget on samples."
          : "The next resolution missed the target. Returning to the highest passing resolution.",
      };
    }
    return beginValidation(next, { resolutionScale: selectedResolution, samplesPerFrame: 1 });
  }

  if (passed) next.selected = { ...session.candidate };
  const hasHigherSamples = session.sampleIndex + 1 < session.sampleSteps.length;
  if (passed && hasHigherSamples) {
    const sampleIndex = session.sampleIndex + 1;
    const candidate = {
      resolutionScale: session.candidate.resolutionScale,
      samplesPerFrame: session.sampleSteps[sampleIndex],
    };
    return {
      ...next,
      sampleIndex,
      candidate,
      status: candidateStatus("Testing next sample count", candidate),
      reason: `Previous test passed at ${Math.round(measurement.measuredFps)} FPS.`,
    };
  }
  return beginValidation(
    next,
    passed ? session.candidate : next.selected,
    passed
      ? "The maximum allowed sample count passed."
      : "The next sample count missed the target."
  );
}

export function cancelCalibration(session: CalibrationSession): CalibrationSession {
  if (session.phase === "complete") return session;
  return {
    ...session,
    phase: "cancelled",
    status: "Calibration cancelled",
    reason: "Manual quality settings remain authoritative.",
  };
}

export function calibrationProgress(session: CalibrationSession) {
  return {
    completed: session.completedTests,
    maximum: session.maximumTests,
    fraction: session.phase === "complete"
      ? 1
      : Math.min(1, session.completedTests / Math.max(1, session.maximumTests)),
  };
}

function beginValidation(
  session: CalibrationSession,
  candidate: CalibrationCandidate,
  reason = "The search reached its quality ceiling."
): CalibrationSession {
  return {
    ...session,
    phase: "validating",
    candidate: { ...candidate },
    selected: { ...candidate },
    status: candidateStatus("Validating selected settings", candidate),
    reason,
  };
}

function frameTimeStatistics(frameTimesMs: readonly number[]) {
  const sorted = frameTimesMs
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b);
  if (sorted.length === 0) throw new RangeError("Calibration requires positive finite frame times");
  return {
    median: percentile(sorted, 0.5),
    p90: percentile(sorted, 0.9),
  };
}

function percentile(sorted: readonly number[], fraction: number) {
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1));
  return sorted[index];
}

function normalizedSteps(
  values: readonly number[],
  minimum: number,
  maximum = Number.POSITIVE_INFINITY
) {
  const steps = [...new Set(values)]
    .filter((value) => Number.isFinite(value) && value >= minimum && value <= maximum)
    .sort((a, b) => a - b);
  if (steps.length > 0) return steps;
  return [Math.min(maximum, Math.max(minimum, values[0] ?? minimum))];
}

function candidateStatus(prefix: string, candidate: CalibrationCandidate) {
  return `${prefix}: ${candidate.resolutionScale}× resolution · ${candidate.samplesPerFrame} sample${candidate.samplesPerFrame === 1 ? "" : "s"}/frame`;
}

function finalReason(
  candidate: CalibrationCandidate,
  measurement: CalibrationMeasurement,
  targetFps: CalibrationTargetFps
) {
  return `Selected ${candidate.resolutionScale}× resolution and ${candidate.samplesPerFrame} sample${candidate.samplesPerFrame === 1 ? "" : "s"}/frame for ${targetFps} FPS; validation measured ${Math.round(measurement.measuredFps)} FPS.`;
}
