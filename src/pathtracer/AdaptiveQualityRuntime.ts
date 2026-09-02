import type PtActions from "./PtActions";
import {
  cancelCalibration,
  createCalibrationSession,
  finishWarmup,
  recordCalibrationTrial,
  type CalibrationSession,
} from "./AdaptiveQualityCalibration";
import {
  loadAdaptiveQualityProfile,
  saveAdaptiveQualityProfile,
  type AdaptiveQualityProfileContext,
} from "./AdaptiveQualityProfiles";

const WARMUP_FRAMES = 5;
const SETTLE_FRAMES = 2;
const MEASURED_FRAMES = 12;

export default class AdaptiveQualityRuntime {
  private session: CalibrationSession | null = null;
  private frameTimes: number[] = [];
  private warmupFrames = 0;
  private settleFrames = 0;
  private applyingCandidate = false;
  private signature = "";
  private context: AdaptiveQualityProfileContext | null = null;
  private validatingStoredProfile = false;
  private readonly unsubscribeState: () => boolean;
  private readonly unsubscribeTiming: () => boolean;

  constructor(
    private readonly actions: PtActions,
    private readonly storage: Storage
  ) {
    actions.configureQualityCalibration({
      cancel: () => this.cancel(),
      recalibrate: () => this.recalibrate(),
    });
    this.unsubscribeState = actions.subscribe(() => this.sync());
    this.unsubscribeTiming = actions.subscribeFrameTiming((frameTimeMs) => this.onFrame(frameTimeMs));
    this.sync();
  }

  public dispose() {
    this.unsubscribeState();
    this.unsubscribeTiming();
  }

  public cancel() {
    if (!this.session) return;
    this.session = cancelCalibration(this.session);
    this.actions.publishQualityCalibration(this.session);
  }

  public recalibrate() {
    this.signature = "";
    this.sync(true);
  }

  private sync(force = false) {
    if (this.applyingCandidate) return;
    const state = this.actions.getState();
    if (state.settings.qualityMode !== "auto" || state.settings.renderMode === "raster") {
      if (this.session && this.session.phase !== "complete" && this.session.phase !== "cancelled") {
        this.cancel();
      }
      return;
    }
    const renderContext = this.actions.getAdaptiveQualityContext();
    const context: AdaptiveQualityProfileContext = {
      sceneKey: state.sceneKey,
      backend: "webgl",
      targetFps: state.settings.qualityTargetFps,
      ...renderContext,
    };
    // Automatic calibration is intentionally scene-entry driven. Quality
    // controls describe the next requested run; editing them must not launch
    // a benchmark while the user is still choosing values. `recalibrate()`
    // explicitly bypasses this scene signature after the Run again action.
    const signature = context.sceneKey;
    if (!force && signature === this.signature) return;
    this.signature = signature;
    this.context = context;

    const stored = force ? null : loadAdaptiveQualityProfile(this.storage, context);
    this.validatingStoredProfile = Boolean(stored);
    this.session = createCalibrationSession({
      targetFps: state.settings.qualityTargetFps,
      minimumResolutionScale: state.settings.qualityMinimumResolutionScale,
      maximumSamplesPerFrame: state.settings.qualityMaximumSamples,
    });
    if (stored) {
      this.session = {
        ...this.session,
        phase: "validating",
        candidate: {
          resolutionScale: stored.resolutionScale,
          samplesPerFrame: stored.samples,
        },
        selected: {
          resolutionScale: stored.resolutionScale,
          samplesPerFrame: stored.samples,
        },
        status: `Checking saved settings: ${stored.resolutionScale}× resolution · ${stored.samples} sample${stored.samples === 1 ? "" : "s"}/frame`,
        reason: "This scene and device have been calibrated before. Running a brief validation for the current browser size.",
      };
    }
    this.resetMeasurement();
    this.applyCandidate();
  }

  private onFrame(frameTimeMs: number) {
    const session = this.session;
    if (!session || session.phase === "complete" || session.phase === "cancelled") return;
    if (document.visibilityState !== "visible") return;
    this.actions.invalidateAdaptiveQualityFrame();
    if (this.settleFrames > 0) {
      this.settleFrames -= 1;
      return;
    }
    if (session.phase === "warmingUp") {
      this.warmupFrames += 1;
      if (this.warmupFrames >= WARMUP_FRAMES) {
        this.session = finishWarmup(session);
        this.resetMeasurement();
        this.actions.publishQualityCalibration(this.session);
      }
      return;
    }
    if (!Number.isFinite(frameTimeMs) || frameTimeMs <= 0 || frameTimeMs > 1000) return;
    this.frameTimes.push(frameTimeMs);
    if (this.frameTimes.length < MEASURED_FRAMES) return;

    const previousCandidate = session.candidate;
    this.session = recordCalibrationTrial(session, this.frameTimes);
    const finalMeasurement = this.session.measurements.at(-1);
    if (this.validatingStoredProfile && this.session.phase === "complete" && finalMeasurement && !finalMeasurement.passed) {
      this.validatingStoredProfile = false;
      const state = this.actions.getState();
      this.session = createCalibrationSession({
        targetFps: state.settings.qualityTargetFps,
        minimumResolutionScale: state.settings.qualityMinimumResolutionScale,
        maximumSamplesPerFrame: state.settings.qualityMaximumSamples,
      });
      this.session.reason = "The saved profile no longer meets the target at this browser size. Running a fresh quality search.";
      this.resetMeasurement();
      this.applyCandidate();
      this.actions.publishQualityCalibration(this.session);
      return;
    }
    this.validatingStoredProfile = false;
    this.actions.publishQualityCalibration(this.session);
    if (this.session.phase === "complete") {
      this.applyCandidate();
      const measurement = this.session.measurements.at(-1);
      if (measurement?.passed && this.context) {
        try {
          saveAdaptiveQualityProfile(this.storage, this.context, {
            resolutionScale: this.session.selected.resolutionScale,
            samples: this.session.selected.samplesPerFrame,
            medianFrameTimeMs: measurement.medianFrameTimeMs,
            p90FrameTimeMs: measurement.p90FrameTimeMs,
            measuredAt: Date.now(),
          });
        } catch {
          // Private browsing and full storage must not interrupt rendering.
        }
      }
      return;
    }
    const candidateChanged = previousCandidate.resolutionScale !== this.session.candidate.resolutionScale ||
      previousCandidate.samplesPerFrame !== this.session.candidate.samplesPerFrame;
    this.resetMeasurement(candidateChanged ? SETTLE_FRAMES : 0);
    this.applyCandidate();
  }

  private resetMeasurement(settleFrames = SETTLE_FRAMES) {
    this.frameTimes = [];
    this.warmupFrames = 0;
    this.settleFrames = settleFrames;
  }

  private applyCandidate() {
    if (!this.session) return;
    this.applyingCandidate = true;
    this.actions.setResolutionScale(this.session.candidate.resolutionScale);
    this.actions.setNumSamples(this.session.candidate.samplesPerFrame);
    this.applyingCandidate = false;
  }
}
