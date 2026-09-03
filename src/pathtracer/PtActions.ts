import * as THREE from "three";
import { PresetPtScenes, resolutionScaleForPreset } from "./PresetPtScenes";
import PtRenderer from "./PtRenderer";
import {
  getMaterialMetadata,
  isPtQuadMesh,
  isPtSphereMesh,
  isPtTriangleMesh,
  sphereRadius,
  type PtEditableObject,
  type PtQuadMesh,
  type PtSphereMesh,
} from "./PtScene";
import {
  LEGACY_FUZZY_METAL_PREVIEW_METALNESS,
  legacyFuzzToPreviewRoughness,
} from "./RasterPreviewQuality";
import {
  isPtAnalyticLightNode,
  syncAnalyticLightPreview,
} from "./PtAnalyticLight";
import PtStore from "./PtStore";
import type { PtStateListener } from "./PtStore";
import type {
  AccumulationFormat,
  PtSettings,
  PtState,
  RenderMode,
  TransformMode,
  TransformSpace,
} from "./PtState";
import { PtInvalidationLevel } from "./PtInvalidation";
import CommandHistory from "./CommandHistory";
import { findBuiltinTexture } from "./BuiltinTextures";
import {
  cloneTexture,
  checkerTexture,
  constantTexture,
  imageTexture,
  perlinTexture,
  PtTextureType,
  type PtTexture,
} from "./PtTexture";
import PtMaterial, { PtMaterialModel, PtMaterialType } from "./PtMaterial";
import {
  createAuthoredCamera,
  type AuthoredCameraInput,
} from "./AuthoredCamera";
import { createStillRenderSnapshot, type StillRenderSettings } from "./StillRenderJob";
import { embedPngText } from "./PngMetadata";

interface TransformSnapshot {
  readonly position: THREE.Vector3;
  readonly quaternion: THREE.Quaternion;
  readonly scale: THREE.Vector3;
}

interface MaterialSnapshot {
  readonly color: number;
  readonly roughness?: number;
  readonly metallic?: number;
  readonly ior?: number;
  readonly texture: PtTexture;
  readonly metallicRoughnessTexture: PtTexture;
  readonly emissionTexture: PtTexture;
  readonly baseColorTextureEnabled: boolean;
  readonly metallicRoughnessTextureEnabled: boolean;
  readonly emissionTextureEnabled: boolean;
  readonly emissionColor: number;
  readonly emissionStrength: number;
  readonly emissionTwoSided: boolean;
}

interface AnalyticLightSnapshot {
  readonly enabled: boolean;
  readonly color: number;
  readonly intensity: number;
  readonly angularDiameter: number;
  readonly innerConeAngle: number;
  readonly outerConeAngle: number;
}

export default class PtActions {
  private selectedObject: PtEditableObject | null = null;
  private readonly selectedObjects = new Set<PtEditableObject>();
  private readonly history = new CommandHistory(100);
  private pendingTransform: {
    object: PtEditableObject;
    before: TransformSnapshot;
  } | null = null;
  private pendingMaterial: {
    materialId: number;
    before: MaterialSnapshot;
  } | null = null;
  private pendingAnalyticLight: {
    object: import("./PtAnalyticLight").PtAnalyticLightNode;
    before: AnalyticLightSnapshot;
  } | null = null;
  private pendingSettings: {
    label: string;
    before: PtSettings;
  } | null = null;
  private nextSphereName = 0;
  private nextQuadName = 0;
  private nextLightName = 0;
  private readonly canceledStillRenderJobs = new Set<string>();
  private readonly stillRenderSceneSnapshots = new Map<string, import("./PtScene").default>();
  private readonly stillRenderSettingsSnapshots = new Map<string, PtSettings>();
  private readonly activeStillRenderers = new Map<string, PtRenderer>();
  private stillRenderQueueActive = false;
  private cancelQualityCalibrationAction: () => void = () => {};
  private recalibrateQualityAction: () => void = () => {};

  constructor(
    private readonly store: PtStore,
    private readonly renderer: PtRenderer,
    private readonly resetPreferencesAction: () => void = () => {}
  ) {
    this.nextSphereName = renderer.ptScene.getSphereMeshes().length;
    this.nextQuadName = renderer.ptScene.getQuadMeshes().length;
    this.renderer.transformControls.mode = this.store.getState().settings.transformMode;
    this.renderer.transformControls.space =
      this.store.getState().settings.transformSpace === "global" ? "world" : "local";
    this.renderer.onBvhTraversalInvalidated(() => {
      this.store.update((state) => ({
        ...state,
        bvhTraversal: {
          armed: false,
          step: -1,
          rayOrigin: null,
          rayDirection: null,
          events: [],
          result: null,
        },
      }));
    });
    this.renderer.onStaticSceneLoaded(() => {
      this.publishSceneObjects();
      this.publishImportWarnings();
    });
    this.configureTransformControls();
    this.publishSceneObjects();
  }

  public getState() {
    return this.store.getState();
  }

  public setCameraDebugViewEnabled(enabled: boolean) {
    this.renderer.setCameraDebugViewEnabled(enabled);
  }

  public setCameraDebugViewport(
    viewport: { left: number; top: number; width: number; height: number } | null
  ) {
    this.renderer.setCameraDebugViewport(viewport);
  }

  public setCameraDebugRayGrid(columns: number, rows: number) {
    this.renderer.setCameraDebugRayGrid(columns, rows);
  }

  public setCameraDebugMaxDepth(depth: number) {
    this.renderer.setCameraDebugMaxDepth(depth);
  }

  public attachCameraDebugControls(element: HTMLElement | null) {
    this.renderer.attachCameraDebugControls(element);
  }

  public resetCameraDebugView() {
    this.renderer.resetCameraDebugView();
  }

  public getTriangleBvhStats() {
    return this.renderer.getTriangleBvhStats();
  }

  public getSphereBvhStats() {
    return this.renderer.getSphereBvhStats();
  }

  public getTriangleBvhProbeStats() {
    return this.renderer.getTriangleBvhProbeStats();
  }

  public armBvhTraversalInspection() {
    this.store.update((state) => ({
      ...state,
      bvhTraversal: { ...state.bvhTraversal, armed: true },
    }));
  }

  public cancelBvhTraversalInspection() {
    this.renderer.setBvhTraversalVisualization(null);
    this.store.update((state) => ({
      ...state,
      bvhTraversal: {
        armed: false,
        step: -1,
        rayOrigin: null,
        rayDirection: null,
        events: [],
        result: null,
      },
    }));
  }

  public inspectBvhTraversalAtNdc(x: number, y: number) {
    const traversal = this.renderer.inspectBvhTraversal(new THREE.Vector2(x, y));
    this.store.update((state) => ({ ...state, bvhTraversal: traversal }));
  }

  public setCameraDebugBvhDepth(depth: number) {
    this.renderer.setCameraDebugBvhDepth(depth);
  }

  public setCameraDebugBvhEnabled(enabled: boolean) {
    this.renderer.setCameraDebugBvhEnabled(enabled);
  }

  public setBvhTraversalStep(step: number) {
    const current = this.store.getState().bvhTraversal;
    if (current.events.length === 0) return;
    const next = {
      ...current,
      step: Math.max(0, Math.min(Math.round(step), current.events.length - 1)),
    };
    this.renderer.setBvhTraversalVisualization(next);
    this.store.update((state) => ({ ...state, bvhTraversal: next }));
  }

  public subscribe(listener: PtStateListener) {
    return this.store.subscribe(listener);
  }

  public getCameraPose() {
    return this.renderer.getCameraPose();
  }

  private currentCameraInput(): AuthoredCameraInput {
    const camera = this.renderer.camera;
    const settings = this.store.getState().settings;
    return {
      position: camera.position.toArray(),
      quaternion: camera.quaternion.toArray(),
      projection: settings.cameraProjectionMode,
      fov: settings.fov,
      orthographicHeight: settings.orthographicHeight,
      depthOfField: settings.enableDepthOfField,
      aperture: settings.aperture,
      focusDistance: settings.focusDistance,
      outputWidth: 1920,
      outputHeight: 1080,
    };
  }

  public captureCurrentRender(includeOverlays = false, includePanels = false) {
    return this.renderer.captureCurrentRender(includeOverlays, includePanels);
  }

  public enqueueStillRender(overrides: Partial<StillRenderSettings> = {}) {
    const state = this.store.getState();
    const requestedWidth = overrides.width ?? 1920;
    const requestedHeight = overrides.height ?? 1080;
    const requestedRenderMode = overrides.renderMode ?? state.settings.renderMode;
    const camera = createAuthoredCamera("Current View", {
      ...this.currentCameraInput(),
      outputWidth: requestedWidth,
      outputHeight: requestedHeight,
    });
    const snapshot = createStillRenderSnapshot(
      state.sceneKey,
      this.renderer.getInvalidationHistory().at(-1)?.sequence ?? state.sceneRevision,
      camera,
      {
        width: requestedWidth,
        height: requestedHeight,
        samples: requestedRenderMode === "raster" ? 1 : (overrides.samples ?? 256),
        maxRayDepth: overrides.maxRayDepth ?? state.settings.maxRayDepth,
        accumulationFormat: overrides.accumulationFormat ?? state.settings.accumulationFormat,
        integratorMode: overrides.integratorMode ?? state.settings.integratorMode,
        renderMode: requestedRenderMode,
        regionTracingMode: overrides.regionTracingMode ?? state.settings.regionTracingMode,
        comparisonTracingMode: overrides.comparisonTracingMode ?? state.settings.comparisonTracingMode,
        comparisonSeam: overrides.comparisonSeam ?? this.renderer.getHybridComparisonSeam(),
        region: overrides.region ?? this.renderer.getHybridRegion(),
        selectedObjectIds: overrides.selectedObjectIds ?? [...this.selectedObjects]
          .filter((object) => !isPtAnalyticLightNode(object))
          .map((object) => object.userData.pathTracer.objectId),
      },
      "pathtracer-lab-webgl2-r1"
    );
    const id = THREE.MathUtils.generateUUID();
    this.store.update((current) => ({
      ...current,
      stillRenderJobs: [...current.stillRenderJobs, {
        id, status: "queued", snapshot, completedSamples: 0, estimatedRemainingMs: null, renderDurationMs: null, previewUrl: null, resultUrl: null, error: null,
      }],
    }));
    const snapshotCamera = this.renderer.ptScene.camera.clone() as THREE.PerspectiveCamera;
    snapshotCamera.position.fromArray(snapshot.camera.position);
    snapshotCamera.quaternion.fromArray(snapshot.camera.quaternion);
    snapshotCamera.fov = snapshot.camera.fov;
    snapshotCamera.updateProjectionMatrix();
    this.stillRenderSceneSnapshots.set(id, this.renderer.ptScene.cloneForOffline(snapshotCamera));
    this.stillRenderSettingsSnapshots.set(id, { ...state.settings });
    void this.runStillRenderQueue();
    return id;
  }

  public cancelStillRender(jobId: string) {
    const job = this.store.getState().stillRenderJobs.find((candidate) => candidate.id === jobId);
    if (!job || job.status === "completed" || job.status === "failed") return false;
    this.canceledStillRenderJobs.add(jobId);
    const isActive = this.activeStillRenderers.has(jobId);
    this.updateStillRenderJob(jobId, { status: isActive ? "canceling" : "canceled" });
    if (!isActive) {
      this.stillRenderSceneSnapshots.delete(jobId);
      this.stillRenderSettingsSnapshots.delete(jobId);
    }
    return true;
  }

  public pauseStillRender(jobId: string) {
    const renderer = this.activeStillRenderers.get(jobId);
    if (!renderer) return false;
    renderer.setRenderingPaused(true);
    this.updateStillRenderJob(jobId, { status: "paused" });
    return true;
  }

  public resumeStillRender(jobId: string) {
    const renderer = this.activeStillRenderers.get(jobId);
    if (!renderer) return false;
    renderer.setRenderingPaused(false);
    this.updateStillRenderJob(jobId, { status: "running" });
    return true;
  }

  public removeStillRenderJob(jobId: string) {
    const job = this.store.getState().stillRenderJobs.find((candidate) => candidate.id === jobId);
    if (!job || job.status === "running" || job.status === "paused" || job.status === "queued") return false;
    if (job.resultUrl) URL.revokeObjectURL(job.resultUrl);
    if (job.previewUrl) URL.revokeObjectURL(job.previewUrl);
    this.stillRenderSceneSnapshots.delete(jobId);
    this.stillRenderSettingsSnapshots.delete(jobId);
    this.canceledStillRenderJobs.delete(jobId);
    this.store.update((state) => ({
      ...state,
      stillRenderJobs: state.stillRenderJobs.filter((candidate) => candidate.id !== jobId),
    }));
    return true;
  }

  public downloadStillRender(jobId: string) {
    const job = this.store.getState().stillRenderJobs.find((candidate) => candidate.id === jobId);
    if (!job?.resultUrl) return false;
    const link = document.createElement("a");
    link.href = job.resultUrl;
    link.download = `${job.snapshot.sceneKey}-${job.snapshot.camera.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${job.snapshot.settings.width}x${job.snapshot.settings.height}.png`;
    link.click();
    return true;
  }

  public dispose() {
    for (const job of this.store.getState().stillRenderJobs) {
      if (job.resultUrl) URL.revokeObjectURL(job.resultUrl);
      if (job.previewUrl) URL.revokeObjectURL(job.previewUrl);
      this.canceledStillRenderJobs.add(job.id);
    }
  }

  private async runStillRenderQueue() {
    if (this.stillRenderQueueActive) return;
    this.stillRenderQueueActive = true;
    try {
      while (true) {
        const job = this.store.getState().stillRenderJobs.find((candidate) => candidate.status === "queued");
        if (!job) break;
        await this.executeStillRenderJob(job.id);
      }
    } finally {
      this.stillRenderQueueActive = false;
    }
  }

  private async executeStillRenderJob(jobId: string) {
    const job = this.store.getState().stillRenderJobs.find((candidate) => candidate.id === jobId);
    if (!job) return;
    const renderStartedAt = performance.now();
    this.updateStillRenderJob(jobId, { status: "running", error: null });
    const canvas = document.createElement("canvas");
    canvas.className = "offline-render-canvas";
    canvas.style.width = `${job.snapshot.settings.width}px`;
    canvas.style.height = `${job.snapshot.settings.height}px`;
    document.body.append(canvas);
    let offlineRenderer: PtRenderer | null = null;
    try {
      const scene = this.stillRenderSceneSnapshots.get(jobId);
      if (!scene) throw new Error("The immutable scene snapshot is no longer available.");
      if (scene.environmentLoaded) await scene.environmentLoaded;
      const sourceSettings = this.stillRenderSettingsSnapshots.get(jobId);
      if (!sourceSettings) throw new Error("The immutable render-settings snapshot is no longer available.");
      const settings: PtSettings = {
        ...sourceSettings,
        renderMode: job.snapshot.settings.renderMode,
        cameraProjectionMode: job.snapshot.camera.projection,
        fov: job.snapshot.camera.fov,
        orthographicHeight: job.snapshot.camera.orthographicHeight,
        enableDepthOfField: job.snapshot.camera.depthOfField,
        aperture: job.snapshot.camera.aperture,
        focusDistance: job.snapshot.camera.focusDistance,
        numSamples: 1,
        maxRayDepth: job.snapshot.settings.maxRayDepth,
        accumulationFormat: job.snapshot.settings.accumulationFormat,
        integratorMode: job.snapshot.settings.integratorMode,
        maxAccumulationFrames: job.snapshot.settings.samples,
        resolutionScale: 1,
        triangleOverlayMode: "off",
        bvhOverlayEnabled: false,
      };
      scene.camera.position.fromArray(job.snapshot.camera.position);
      scene.camera.quaternion.fromArray(job.snapshot.camera.quaternion);
      scene.camera.fov = job.snapshot.camera.fov;
      scene.camera.updateProjectionMatrix();
      offlineRenderer = new PtRenderer(canvas, scene, settings);
      this.activeStillRenderers.set(jobId, offlineRenderer);
      offlineRenderer.setCameraProjectionMode(job.snapshot.camera.projection, false);
      offlineRenderer.setCameraPose(job.snapshot.camera.position, job.snapshot.camera.quaternion);
      offlineRenderer.setFixedOutputSize(job.snapshot.settings.width, job.snapshot.settings.height);
      offlineRenderer.setRegionTracingMode(job.snapshot.settings.regionTracingMode);
      offlineRenderer.setComparisonTracingMode(job.snapshot.settings.comparisonTracingMode);
      offlineRenderer.setHybridComparisonSeam(job.snapshot.settings.comparisonSeam);
      offlineRenderer.setHybridRegion(...job.snapshot.settings.region);
      offlineRenderer.setSelectedObjectIds(job.snapshot.settings.selectedObjectIds);
      offlineRenderer.setRenderMode(job.snapshot.settings.renderMode);
      if (job.snapshot.settings.renderMode === "raster") {
        await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      }
      let reportedSamples = -1;
      let previewThreshold = Math.max(1, Math.ceil(job.snapshot.settings.samples / 8));
      let lastObservationAt = performance.now();
      let estimatedMsPerSample: number | null = null;
      let lastEtaReportedAt = 0;
      while (job.snapshot.settings.renderMode !== "raster" && offlineRenderer.getAccumulatedFrames() < job.snapshot.settings.samples) {
        if (this.canceledStillRenderJobs.has(jobId)) break;
        const observationAt = performance.now();
        const completedSamples = offlineRenderer.getAccumulatedFrames();
        if (completedSamples !== reportedSamples) {
          const sampleDelta = reportedSamples < 0 ? 0 : completedSamples - reportedSamples;
          if (sampleDelta > 0) {
            const observedMsPerSample = (observationAt - lastObservationAt) / sampleDelta;
            estimatedMsPerSample = estimatedMsPerSample === null
              ? observedMsPerSample
              : estimatedMsPerSample * 0.75 + observedMsPerSample * 0.25;
          }
          reportedSamples = completedSamples;
          const shouldReportEta = estimatedMsPerSample !== null &&
            (lastEtaReportedAt === 0 || observationAt - lastEtaReportedAt >= 2000);
          if (shouldReportEta) lastEtaReportedAt = observationAt;
          this.updateStillRenderJob(jobId, {
            completedSamples,
            ...(shouldReportEta ? {
              estimatedRemainingMs: Math.max(
                0,
                (job.snapshot.settings.samples - completedSamples) * estimatedMsPerSample!
              ),
            } : {}),
          });
        }
        lastObservationAt = observationAt;
        if (completedSamples >= previewThreshold) {
          const preview = await offlineRenderer.captureCurrentRender(true, false, false);
          const previousPreview = this.store.getState().stillRenderJobs.find((candidate) => candidate.id === jobId)?.previewUrl;
          if (previousPreview) URL.revokeObjectURL(previousPreview);
          this.updateStillRenderJob(jobId, { previewUrl: URL.createObjectURL(preview.blob) });
          previewThreshold += Math.max(1, Math.ceil(job.snapshot.settings.samples / 8));
        }
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      }
      const completedSamples = job.snapshot.settings.renderMode === "raster"
        ? 1
        : offlineRenderer.getAccumulatedFrames();
      const capture = await offlineRenderer.captureCurrentRender(true, false, false);
      const wasCanceled = this.canceledStillRenderJobs.has(jobId);
      const metadata = JSON.stringify({
        application: "Pathtracer Lab",
        backend: job.snapshot.backendVersion,
        scene: job.snapshot.sceneKey,
        sceneRevision: job.snapshot.sceneRevision,
        camera: job.snapshot.camera,
        render: job.snapshot.settings,
        outcome: wasCanceled ? "canceled" : "completed",
        completedSamples,
        createdAt: new Date(job.snapshot.createdAt).toISOString(),
      });
      const outputBlob = await embedPngText(capture.blob, "Pathtracer Lab", metadata);
      const previousPreview = this.store.getState().stillRenderJobs.find((candidate) => candidate.id === jobId)?.previewUrl;
      if (previousPreview) URL.revokeObjectURL(previousPreview);
      this.updateStillRenderJob(jobId, {
        status: wasCanceled ? "canceled" : "completed",
        completedSamples,
        estimatedRemainingMs: null,
        renderDurationMs: performance.now() - renderStartedAt,
        previewUrl: null,
        resultUrl: URL.createObjectURL(outputBlob),
      });
    } catch (error) {
      this.updateStillRenderJob(jobId, {
        status: "failed",
        renderDurationMs: performance.now() - renderStartedAt,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      offlineRenderer?.dispose();
      this.activeStillRenderers.delete(jobId);
      canvas.remove();
      this.canceledStillRenderJobs.delete(jobId);
      this.stillRenderSceneSnapshots.delete(jobId);
      this.stillRenderSettingsSnapshots.delete(jobId);
    }
  }

  private updateStillRenderJob(
    jobId: string,
    patch: Partial<PtState["stillRenderJobs"][number]>
  ) {
    this.store.update((state) => ({
      ...state,
      stillRenderJobs: state.stillRenderJobs.map((job) =>
        job.id === jobId ? { ...job, ...patch } : job
      ),
    }));
  }

  public onCameraPoseChanged(listener: () => void) {
    return this.renderer.onCameraPoseChanged(listener);
  }

  public getInvalidationHistory() {
    return this.renderer.getInvalidationHistory();
  }

  public getHistory() {
    return this.history.getSnapshot();
  }

  public resetPreferences() {
    this.resetPreferencesAction();
  }

  public undo() {
    const canceledTransform = this.cancelSelectedTransform();
    const canceledMaterial = this.cancelMaterialEdit();
    const canceledLight = this.cancelSelectedLightEdit();
    const canceledSettings = this.cancelSettingsEdit();
    if (canceledTransform || canceledMaterial || canceledLight || canceledSettings) return true;
    const changed = this.history.undo();
    if (changed) this.publishHistory();
    return changed;
  }

  public redo() {
    const canceledTransform = this.cancelSelectedTransform();
    const canceledMaterial = this.cancelMaterialEdit();
    const canceledLight = this.cancelSelectedLightEdit();
    const canceledSettings = this.cancelSettingsEdit();
    if (canceledTransform || canceledMaterial || canceledLight || canceledSettings) return true;
    const changed = this.history.redo();
    if (changed) this.publishHistory();
    return changed;
  }

  public setScene(sceneKey: string) {
    const createScene = PresetPtScenes[sceneKey];
    if (!createScene) throw new RangeError(`Unknown scene preset: ${sceneKey}`);

    const scene = createScene();
    this.pendingTransform = null;
    this.pendingMaterial = null;
    this.pendingAnalyticLight = null;
    this.pendingSettings = null;
    // Presets are whole-scene replacements, so commands referring to the old
    // scene are intentionally discarded rather than replayed into a new one.
    this.history.clear();
    this.selectedObject = null;
    this.selectedObjects.clear();
    this.renderer.setSelectedObjectIds([]);
    this.renderer.setBvhTraversalVisualization(null);
    this.renderer.transformControls.detach();
    this.renderer.outlinePass.selectedObjects = [];
    this.renderer.setScene(scene, false);
    this.renderer.setFov(scene.camera.fov, false);
    this.renderer.setCameraProjectionMode(
      this.store.getState().settings.cameraProjectionMode,
      false
    );
    this.renderer.setDepthOfFieldEnabled(false, false);
    this.renderer.setNumSamples(1, false);
    const resolutionScale = resolutionScaleForPreset(
      sceneKey,
      this.store.getState().settings.resolutionScale
    );
    this.renderer.setResolutionScale(resolutionScale);

    this.store.update((state) => ({
      ...state,
      sceneKey,
      settings: {
        ...state.settings,
        backgroundColorTop: `#${scene.backgroundColorTop.getHexString()}`,
        backgroundColorBottom: `#${scene.backgroundColorBottom.getHexString()}`,
        environmentMode: scene.environmentSource ? "map" : "gradient",
        environmentSource: scene.environmentSource,
        environmentLabel: scene.environmentLabel,
        fov: scene.camera.fov,
        numSamples: 1,
        resolutionScale,
        enableDepthOfField: false,
      },
      selection: this.emptySelection(),
      sceneObjects: [],
      importWarnings: [...scene.staticAssetWarnings],
      bvhTraversal: {
        armed: false,
        step: -1,
        rayOrigin: null,
        rayDirection: null,
        events: [],
        result: null,
      },
    }));
    this.publishSceneObjects();
    Object.assign(this.renderer.settings, this.store.getState().settings);
    if (scene.initialEnvironmentIntensity !== null) {
      this.setEnvironmentIntensity(scene.initialEnvironmentIntensity);
    }
    this.publishHistory();
    this.renderer.invalidate(PtInvalidationLevel.Scene, "scene preset replaced");
    this.nextSphereName = scene.getSphereMeshes().length;
    this.nextQuadName = scene.getQuadMeshes().length;
  }

  public setRenderMode(mode: RenderMode) {
    this.renderer.setRenderMode(mode);
    this.updateSetting("renderMode", mode);
  }

  public setQualityMode(mode: PtSettings["qualityMode"]) {
    this.updateSetting("qualityMode", mode);
  }

  public setQualityTargetFps(fps: PtSettings["qualityTargetFps"]) {
    this.updateSetting("qualityTargetFps", fps);
  }

  public setQualityMinimumResolutionScale(scale: number) {
    this.updateSetting("qualityMinimumResolutionScale", scale);
  }

  public setQualityMaximumSamples(samples: number) {
    this.updateSetting("qualityMaximumSamples", Math.max(1, Math.min(20, Math.round(samples))));
  }

  public publishQualityCalibration(session: PtState["qualityCalibration"]) {
    this.store.update((state) => ({ ...state, qualityCalibration: session }));
  }

  public configureQualityCalibration(actions: { cancel: () => void; recalibrate: () => void }) {
    this.cancelQualityCalibrationAction = actions.cancel;
    this.recalibrateQualityAction = actions.recalibrate;
  }

  public cancelQualityCalibration() {
    this.cancelQualityCalibrationAction();
  }

  public recalibrateQuality() {
    this.recalibrateQualityAction();
  }

  public subscribeFrameTiming(listener: (frameTimeMs: number) => void) {
    return this.renderer.subscribeFrameTiming(listener);
  }

  public getAdaptiveQualityContext() {
    return this.renderer.getAdaptiveQualityContext();
  }

  public invalidateAdaptiveQualityFrame() {
    this.renderer.invalidateAdaptiveQualityFrame();
  }

  public setRegionTracingMode(mode: PtSettings["regionTracingMode"]) {
    this.renderer.setRegionTracingMode(mode);
    this.updateSetting("regionTracingMode", mode);
  }

  public setComparisonTracingMode(mode: PtSettings["comparisonTracingMode"]) {
    this.renderer.setComparisonTracingMode(mode);
    this.updateSetting("comparisonTracingMode", mode);
  }

  /** Ephemeral comparison UI state; changing it does not invalidate accumulation. */
  public setHybridComparisonSeam(seam: number) {
    this.renderer.setHybridComparisonSeam(seam);
  }

  public getHybridComparisonSeam() {
    return this.renderer.getHybridComparisonSeam();
  }

  public setHybridComparisonInteractionActive(active: boolean) {
    this.renderer.setHybridInteractionActive(active);
  }

  /** Ephemeral ROI UI state; moving it resets the region's accumulation count. */
  public setHybridRegion(left: number, top: number, width: number, height: number) {
    this.renderer.setHybridRegion(left, top, width, height);
  }

  /** Pauses expensive full-frame sampling while the ROI overlay is manipulated. */
  public setHybridRegionInteractionActive(active: boolean) {
    this.renderer.setHybridRegionInteractionActive(active);
  }

  public setBackgroundColorTop(value: THREE.ColorRepresentation) {
    const color = new THREE.Color(value);
    this.renderer.ptScene.scene.background = color;
    this.renderer.ptScene.dirLight.color = color;
    this.renderer.uniforms.uBackgroundColorTop.value = color;
    this.renderer.invalidate(
      PtInvalidationLevel.Settings,
      "background top color changed"
    );
    this.updateSetting("backgroundColorTop", `#${color.getHexString()}`);
  }

  public setBackgroundColorBottom(value: THREE.ColorRepresentation) {
    const color = new THREE.Color(value);
    this.renderer.uniforms.uBackgroundColorBottom.value = color;
    this.renderer.invalidate(
      PtInvalidationLevel.Settings,
      "background bottom color changed"
    );
    this.updateSetting("backgroundColorBottom", `#${color.getHexString()}`);
  }

  public setEnvironmentGradient() {
    this.renderer.ptScene.scene.background = this.renderer.ptScene.backgroundColorTop;
    this.renderer.ptScene.scene.environment = this.renderer.settings.environmentLightingEnabled
      ? this.renderer.ptScene.rasterGradientEnvironmentTexture
      : null;
    this.renderer.settings.environmentMode = "gradient";
    this.renderer.uniforms.uEnvironmentEnabled.value = false;
    this.renderer.invalidate(PtInvalidationLevel.Settings, "gradient environment selected");
    this.store.update((state) => ({
      ...state,
      settings: {
        ...state.settings,
        environmentMode: "gradient",
        environmentSource: "",
        environmentLabel: "Gradient",
      },
    }));
  }

  public setEnvironmentMap(source: string, label: string) {
    this.renderer.settings.environmentMode = "map";
    this.renderer.setEnvironmentMap(source, label);
    this.store.update((state) => ({
      ...state,
      settings: {
        ...state.settings,
        environmentMode: "map",
        environmentSource: source,
        environmentLabel: label,
      },
    }));
  }

  public setEnvironmentRotation(value: number) {
    this.renderer.ptScene.scene.backgroundRotation.y = THREE.MathUtils.degToRad(value);
    this.renderer.ptScene.scene.environmentRotation.y = THREE.MathUtils.degToRad(value);
    this.renderer.settings.environmentRotation = value;
    this.renderer.uniforms.uEnvironmentRotation.value = value;
    this.renderer.ptScene.syncEnvironmentShadowDirection(value);
    this.renderer.invalidate(PtInvalidationLevel.Settings, "environment rotation changed");
    this.updateSetting("environmentRotation", value);
  }

  public setEnvironmentIntensity(value: number) {
    this.renderer.ptScene.scene.backgroundIntensity = value;
    this.renderer.settings.environmentIntensity = value;
    this.renderer.uniforms.uEnvironmentIntensity.value = value;
    this.renderer.invalidate(PtInvalidationLevel.Settings, "environment background intensity changed");
    this.updateSetting("environmentIntensity", value);
  }

  public setEnvironmentLightingIntensity(value: number) {
    this.renderer.ptScene.scene.environmentIntensity = value;
    this.renderer.settings.environmentLightingIntensity = value;
    this.renderer.uniforms.uEnvironmentLightingIntensity.value = value;
    this.renderer.invalidate(PtInvalidationLevel.Settings, "environment lighting intensity changed");
    this.updateSetting("environmentLightingIntensity", value);
  }

  public setEnvironmentBackgroundVisible(value: boolean) {
    this.renderer.settings.environmentBackgroundVisible = value;
    this.renderer.uniforms.uEnvironmentBackgroundVisible.value = value;
    this.renderer.ptScene.scene.background = value
      ? this.renderer.ptScene.environmentTexture
      : null;
    this.renderer.invalidate(PtInvalidationLevel.Settings, "environment background visibility changed");
    this.updateSetting("environmentBackgroundVisible", value);
  }

  public setEnvironmentLightingEnabled(value: boolean) {
    this.renderer.settings.environmentLightingEnabled = value;
    this.renderer.uniforms.uEnvironmentLightingEnabled.value = value;
    this.renderer.ptScene.scene.environment = value
      ? this.renderer.settings.environmentMode === "map"
        ? this.renderer.ptScene.environmentTexture
        : this.renderer.ptScene.rasterGradientEnvironmentTexture
      : null;
    this.renderer.invalidate(PtInvalidationLevel.Settings, "environment lighting changed");
    this.updateSetting("environmentLightingEnabled", value);
  }

  public setFov(fov: number) {
    this.renderer.setFov(fov);
    this.updateSetting("fov", fov);
  }

  public setCameraProjectionMode(mode: PtSettings["cameraProjectionMode"]) {
    let orthographicHeight = this.store.getState().settings.orthographicHeight;
    if (mode === "orthographic") {
      const viewDistance = this.renderer.camera.position.distanceTo(
        this.renderer.orbitControls.target
      );
      orthographicHeight = Math.max(
        0.05,
        2 * viewDistance * Math.tan(
          THREE.MathUtils.degToRad(this.store.getState().settings.fov) / 2
        )
      );
      this.renderer.setOrthographicHeight(orthographicHeight, false);
    }
    this.renderer.setCameraProjectionMode(mode);
    this.store.update((state) => ({
      ...state,
      settings: {
        ...state.settings,
        cameraProjectionMode: mode,
        orthographicHeight,
        enableDepthOfField:
          mode === "orthographic" ? false : state.settings.enableDepthOfField,
      },
    }));
  }

  public setOrthographicHeight(height: number) {
    this.renderer.setOrthographicHeight(height);
    this.updateSetting("orthographicHeight", height);
  }

  public setNumSamples(samples: number) {
    this.renderer.setNumSamples(samples);
    this.updateSetting("numSamples", samples);
  }

  public setMaxRayDepth(depth: number) {
    this.renderer.setMaxRayDepth(depth);
    this.updateSetting("maxRayDepth", depth);
  }

  public setIntegratorMode(mode: PtSettings["integratorMode"]) {
    this.renderer.setIntegratorMode(mode);
    this.updateSetting("integratorMode", mode);
  }

  public setTriangleTraversalMode(mode: PtSettings["triangleTraversalMode"]) {
    this.renderer.setTriangleTraversalMode(mode);
    this.updateSetting("triangleTraversalMode", mode);
  }

  public setTriangleOverlayMode(mode: PtSettings["triangleOverlayMode"]) {
    this.renderer.setTriangleOverlayMode(mode);
    this.updateSetting("triangleOverlayMode", mode);
    if (this.selectedObject && isPtTriangleMesh(this.selectedObject)) {
      this.publishSelection();
    }
  }

  public setSelectedTriangleWireframeVisible(visible: boolean) {
    if (!this.selectedObject || !isPtTriangleMesh(this.selectedObject)) return;
    this.renderer.setTriangleWireframeVisible(
      this.selectedObject.userData.pathTracer.objectId,
      visible
    );
    this.publishSelection();
  }

  public setBvhOverlayEnabled(enabled: boolean) {
    this.renderer.setBvhOverlayEnabled(enabled);
    this.updateSetting("bvhOverlayEnabled", enabled);
  }

  public setBvhOverlayDepth(depth: number) {
    this.renderer.setBvhOverlayDepth(depth);
    this.updateSetting("bvhOverlayDepth", depth);
  }

  public setResolutionScale(scale: number) {
    this.renderer.setResolutionScale(scale);
    this.updateSetting("resolutionScale", scale);
  }

  public setAccumulationFormat(format: AccumulationFormat) {
    this.renderer.setAccumulationFormat(format);
    this.updateSetting("accumulationFormat", format);
  }

  public setMaxAccumulationFrames(frames: number) {
    this.renderer.setMaxAccumulationFrames(frames);
    this.updateSetting("maxAccumulationFrames", frames);
  }

  public setDepthOfFieldEnabled(enabled: boolean) {
    const effectiveEnabled =
      enabled && this.store.getState().settings.cameraProjectionMode !== "orthographic";
    this.renderer.setDepthOfFieldEnabled(effectiveEnabled);
    this.updateSetting("enableDepthOfField", effectiveEnabled);
  }

  public setAperture(aperture: number) {
    this.renderer.setAperture(aperture);
    this.updateSetting("aperture", aperture);
  }

  public setFocusDistance(distance: number) {
    this.renderer.setFocusDistance(distance);
    this.updateSetting("focusDistance", distance);
  }

  public beginSettingsEdit(label: string) {
    if (this.pendingSettings) return;
    this.pendingSettings = {
      label,
      before: structuredClone(this.store.getState().settings),
    };
  }

  public commitSettingsEdit() {
    const pending = this.pendingSettings;
    this.pendingSettings = null;
    if (!pending) return false;
    const after = structuredClone(this.store.getState().settings);
    if (this.settingsEqual(pending.before, after)) return false;

    this.history.record({
      label: pending.label,
      execute: () => this.applySettings(after),
      undo: () => this.applySettings(pending.before),
    });
    this.publishHistory();
    return true;
  }

  public cancelSettingsEdit() {
    const pending = this.pendingSettings;
    this.pendingSettings = null;
    if (!pending) return false;
    this.applySettings(pending.before);
    return true;
  }

  public setTransformMode(mode: TransformMode) {
    if (
      this.selectedObject &&
      isPtAnalyticLightNode(this.selectedObject) &&
      (mode === "scale" ||
        (mode === "rotate" && this.selectedObject.userData.pathTracer.lightType === "point"))
    ) return;
    this.renderer.transformControls.mode = mode;
    this.configureTransformControls();
    this.updateSetting("transformMode", mode);
  }

  public setTransformSpace(space: TransformSpace) {
    this.renderer.transformControls.space = space === "global" ? "world" : "local";
    this.updateSetting("transformSpace", space);
  }

  public selectObject(
    object: PtEditableObject | null,
    mode: "replace" | "add" | "remove" = "replace"
  ) {
    this.commitSelectedTransform();
    this.commitMaterialEdit();
    this.commitSelectedLightEdit();

    if (mode === "replace") {
      this.selectedObjects.clear();
      if (object) this.selectedObjects.add(object);
      this.selectedObject = object;
    } else if (mode === "add" && object) {
      this.selectedObjects.add(object);
      this.selectedObject = object;
    } else if (mode === "remove" && object) {
      this.selectedObjects.delete(object);
      if (this.selectedObject === object) {
        this.selectedObject = [...this.selectedObjects].at(-1) ?? null;
      }
    }

    const primary = this.selectedObject;
    this.renderer.setSelectedObjectIds(
      [...this.selectedObjects]
        .filter((candidate) => !isPtAnalyticLightNode(candidate))
        .map((candidate) => candidate.userData.pathTracer.objectId)
    );
    this.renderer.setSelectedTriangleMesh(primary && isPtTriangleMesh(primary)
      ? primary.userData.pathTracer.objectId
      : null);
    if (!primary) {
      this.renderer.outlinePass.selectedObjects = [];
      this.renderer.transformControls.detach();
      this.store.update((state) => ({
        ...state,
        selection: this.emptySelection(),
      }));
      return null;
    }

    this.renderer.outlinePass.selectedObjects = [...this.selectedObjects];
    this.renderer.transformControls.attach(primary);
    if (
      isPtAnalyticLightNode(primary) &&
      (this.renderer.transformControls.mode === "scale" ||
        (primary.userData.pathTracer.lightType === "point" &&
          this.renderer.transformControls.mode === "rotate"))
    ) {
      this.setTransformMode("translate");
    }
    this.configureTransformControls();
    this.publishSelection();
    return primary;
  }

  public selectSphere(sphereIndex: number) {
    const object = this.renderer.ptScene
      .getSphereMeshes()
      .find(
        (sphere) =>
          sphere.userData.pathTracer.primitiveIndex === sphereIndex
      );
    this.selectObject(object ?? null);
  }

  public selectQuad(quadIndex: number) {
    const object = this.renderer.ptScene
      .getQuadMeshes()
      .find((quad) => quad.userData.pathTracer.primitiveIndex === quadIndex);
    this.selectObject(object ?? null);
  }

  public selectObjectById(objectId: string) {
    const scene = this.renderer.ptScene;
    const object = [
      ...scene.getSphereMeshes(),
      ...scene.getQuadMeshes(),
      ...scene.getAnalyticLightNodes(),
      ...scene.getTriangleMeshes(),
    ].find((candidate) => candidate.userData.pathTracer.objectId === objectId);
    this.selectObject(object ?? null);
  }

  public addSphere() {
    this.commitSelectedTransform();
    this.commitMaterialEdit();
    const scene = this.renderer.ptScene;
    const direction = new THREE.Vector3();
    this.renderer.camera.getWorldDirection(direction);
    const position = this.renderer.camera.position
      .clone()
      .addScaledVector(direction, 3);
    const object = scene.createSphereMesh(
      position,
      0.5,
      0,
      `Sphere ${this.nextSphereName++}`
    );
    const index = scene.intersectGroup.children.length;

    const insert = () => {
      scene.insertSphereMesh(object, index);
      this.publishSceneObjects();
      this.selectObject(object);
      this.renderer.invalidate(PtInvalidationLevel.Scene, "sphere added");
    };
    const remove = () => {
      scene.removeSphereMesh(object);
      this.publishSceneObjects();
      if (this.selectedObject === object) this.selectObject(null);
      this.renderer.invalidate(PtInvalidationLevel.Scene, "added sphere removed");
    };

    insert();
    this.history.record({
      label: `Add ${object.userData.pathTracer.objectName}`,
      execute: insert,
      undo: remove,
    });
    this.publishHistory();
    return true;
  }

  public addQuad() {
    this.commitSelectedTransform();
    this.commitMaterialEdit();
    const scene = this.renderer.ptScene;
    const direction = new THREE.Vector3();
    this.renderer.camera.getWorldDirection(direction);
    const position = this.renderer.camera.position.clone().addScaledVector(direction, 3);
    const rotation = this.renderer.camera.quaternion.clone();
    const object = scene.createQuadMesh(
      position,
      rotation,
      1,
      1,
      0,
      `Quad ${this.nextQuadName++}`
    );
    const index = scene.intersectGroup.children.length;
    const insert = () => {
      scene.insertQuadMesh(object, index);
      this.publishSceneObjects();
      this.selectObject(object);
      this.renderer.invalidate(PtInvalidationLevel.Scene, "quad added");
    };
    const remove = () => {
      scene.removeQuadMesh(object);
      this.publishSceneObjects();
      if (this.selectedObject === object) this.selectObject(null);
      this.renderer.invalidate(PtInvalidationLevel.Scene, "added quad removed");
    };
    insert();
    this.history.record({
      label: `Add ${object.userData.pathTracer.objectName}`,
      execute: insert,
      undo: remove,
    });
    this.publishHistory();
    return true;
  }

  public addEmissiveSphere() {
    const scene = this.renderer.ptScene;
    const materialId = scene.addMaterial(
      PtMaterial.emissive(new THREE.Color(1, 0.72, 0.38), 8, true)
    );
    return this.addSphereWithMaterial(
      materialId,
      `Sphere Light ${this.nextLightName++}`
    );
  }

  public addEmissiveQuad() {
    const scene = this.renderer.ptScene;
    const materialId = scene.addMaterial(
      PtMaterial.emissive(new THREE.Color(1, 0.86, 0.62), 10)
    );
    return this.addQuadWithMaterial(
      materialId,
      `Quad Light ${this.nextLightName++}`
    );
  }

  public addPointLight() {
    return this.addAnalyticLight("point");
  }

  public addDirectionalLight() {
    return this.addAnalyticLight("directional");
  }

  public addSpotLight() {
    return this.addAnalyticLight("spot");
  }

  private addAnalyticLight(type: "point" | "directional" | "spot") {
    this.commitSelectedTransform();
    this.commitMaterialEdit();
    this.commitSelectedLightEdit();
    const scene = this.renderer.ptScene;
    const direction = new THREE.Vector3();
    this.renderer.camera.getWorldDirection(direction);
    const position = this.renderer.camera.position.clone().addScaledVector(direction, 3);
    const label = type === "point" ? "Point Light" : type === "directional" ? "Sun" : "Spot Light";
    const object = type === "point"
      ? scene.createPointLightNode(position, `${label} ${this.nextLightName++}`)
      : type === "directional"
        ? scene.createDirectionalLightNode(position, `${label} ${this.nextLightName++}`)
        : scene.createSpotLightNode(position, `${label} ${this.nextLightName++}`);
    if (type !== "point") object.quaternion.copy(this.renderer.camera.quaternion);
    const index = scene.analyticLightGroup.children.length;
    const insert = () => {
      scene.insertAnalyticLightNode(object, index);
      this.publishSceneObjects();
      this.selectObject(object);
      this.renderer.invalidate(PtInvalidationLevel.Scene, `${type} light added`);
    };
    const remove = () => {
      scene.removeAnalyticLightNode(object);
      this.publishSceneObjects();
      if (this.selectedObject === object) this.selectObject(null);
      this.renderer.invalidate(PtInvalidationLevel.Scene, `added ${type} light removed`);
    };
    insert();
    this.history.record({
      label: `Add ${object.userData.pathTracer.objectName}`,
      execute: insert,
      undo: remove,
    });
    this.publishHistory();
    return true;
  }

  private addSphereWithMaterial(materialId: number, objectName: string) {
    this.commitSelectedTransform();
    this.commitMaterialEdit();
    const scene = this.renderer.ptScene;
    const direction = new THREE.Vector3();
    this.renderer.camera.getWorldDirection(direction);
    const position = this.renderer.camera.position.clone().addScaledVector(direction, 3);
    const object = scene.createSphereMesh(position, 0.35, materialId, objectName);
    return this.insertNewObject(object, "emissive sphere light added");
  }

  private addQuadWithMaterial(materialId: number, objectName: string) {
    this.commitSelectedTransform();
    this.commitMaterialEdit();
    const scene = this.renderer.ptScene;
    const direction = new THREE.Vector3();
    this.renderer.camera.getWorldDirection(direction);
    const position = this.renderer.camera.position.clone().addScaledVector(direction, 3);
    const object = scene.createQuadMesh(
      position,
      this.renderer.camera.quaternion.clone(),
      1,
      1,
      materialId,
      objectName
    );
    return this.insertNewObject(object, "emissive quad light added");
  }

  private insertNewObject(object: PtSphereMesh | PtQuadMesh, reason: string) {
    const scene = this.renderer.ptScene;
    const index = scene.intersectGroup.children.length;
    const insert = () => {
      if (isPtSphereMesh(object)) scene.insertSphereMesh(object, index);
      else scene.insertQuadMesh(object, index);
      this.publishSceneObjects();
      this.selectObject(object);
      this.renderer.invalidate(PtInvalidationLevel.Scene, reason);
    };
    const remove = () => {
      if (isPtSphereMesh(object)) scene.removeSphereMesh(object);
      else scene.removeQuadMesh(object);
      this.publishSceneObjects();
      if (this.selectedObject === object) this.selectObject(null);
      this.renderer.invalidate(PtInvalidationLevel.Scene, `${reason} undone`);
    };
    insert();
    this.history.record({
      label: `Add ${object.userData.pathTracer.objectName}`,
      execute: insert,
      undo: remove,
    });
    this.publishHistory();
    return true;
  }

  public renameSelectedObject(nextName: string) {
    const object = this.selectedObject;
    const name = nextName.trim();
    if (!object || !name) return false;
    const previousName = object.userData.pathTracer.objectName;
    if (name === previousName) return false;
    const apply = (value: string) => {
      object.userData.pathTracer.objectName = value;
      this.publishSceneObjects();
      if (this.selectedObject === object) this.publishSelection();
    };
    apply(name);
    this.history.record({
      label: `Rename ${previousName}`,
      execute: () => apply(name),
      undo: () => apply(previousName),
    });
    this.publishHistory();
    return true;
  }

  public frameSelectedObject() {
    if (!this.selectedObject) return false;
    this.renderer.frameObject(this.selectedObject);
    return true;
  }

  public removeSelectedObject() {
    const object = this.selectedObject;
    if (!object || isPtTriangleMesh(object)) return false;
    this.commitSelectedTransform();
    this.commitMaterialEdit();
    const scene = this.renderer.ptScene;
    const index = isPtAnalyticLightNode(object)
      ? scene.analyticLightGroup.children.indexOf(object)
      : scene.intersectGroup.children.indexOf(object);
    if (index < 0) return false;

    const remove = () => {
      if (isPtSphereMesh(object)) scene.removeSphereMesh(object);
      else if (isPtQuadMesh(object)) scene.removeQuadMesh(object);
      else scene.removeAnalyticLightNode(object);
      this.publishSceneObjects();
      if (this.selectedObject === object) this.selectObject(null);
      this.renderer.invalidate(PtInvalidationLevel.Scene, "object removed");
    };
    const restore = () => {
      if (isPtSphereMesh(object)) scene.insertSphereMesh(object, index);
      else if (isPtQuadMesh(object)) scene.insertQuadMesh(object, index);
      else scene.insertAnalyticLightNode(object, index);
      this.publishSceneObjects();
      this.selectObject(object);
      this.renderer.invalidate(PtInvalidationLevel.Scene, "sphere restored");
    };

    remove();
    this.history.record({
      label: `Remove ${object.userData.pathTracer.objectName}`,
      execute: remove,
      undo: restore,
    });
    this.publishHistory();
    return true;
  }

  public duplicateSelectedObject() {
    const source = this.selectedObject;
    if (!source || isPtTriangleMesh(source)) return false;
    this.commitSelectedTransform();
    this.commitMaterialEdit();
    const scene = this.renderer.ptScene;
    const object = source.clone() as PtSphereMesh | PtQuadMesh | import("./PtAnalyticLight").PtAnalyticLightNode;
    object.userData.pathTracer = isPtSphereMesh(source)
      ? {
          objectId: THREE.MathUtils.generateUUID(),
          objectName: `${source.userData.pathTracer.objectName} Copy`,
          primitiveIndex: scene.getSphereMeshes().length,
          primitiveType: "sphere",
          uvMapping: source.userData.pathTracer.uvMapping,
        }
      : isPtQuadMesh(source) ? {
          objectId: THREE.MathUtils.generateUUID(),
          objectName: `${source.userData.pathTracer.objectName} Copy`,
          primitiveIndex: scene.getQuadMeshes().length,
          primitiveType: "quad",
        } : {
          ...source.userData.pathTracer,
          objectId: THREE.MathUtils.generateUUID(),
          objectName: `${source.userData.pathTracer.objectName} Copy`,
          color: source.userData.pathTracer.color.clone(),
        };
    const index = isPtAnalyticLightNode(object)
      ? scene.analyticLightGroup.children.length
      : scene.intersectGroup.children.length;

    const insert = () => {
      if (isPtSphereMesh(object)) scene.insertSphereMesh(object, index);
      else if (isPtQuadMesh(object)) scene.insertQuadMesh(object, index);
      else scene.insertAnalyticLightNode(object, index);
      this.publishSceneObjects();
      this.selectObject(object);
      this.renderer.invalidate(PtInvalidationLevel.Scene, "object duplicated");
    };
    const remove = () => {
      if (isPtSphereMesh(object)) scene.removeSphereMesh(object);
      else if (isPtQuadMesh(object)) scene.removeQuadMesh(object);
      else scene.removeAnalyticLightNode(object);
      this.publishSceneObjects();
      if (this.selectedObject === object) this.selectObject(null);
      this.renderer.invalidate(
        PtInvalidationLevel.Scene,
        "duplicated sphere removed"
      );
    };

    insert();
    this.history.record({
      label: `Duplicate ${source.userData.pathTracer.objectName}`,
      execute: insert,
      undo: remove,
    });
    this.publishHistory();
    return true;
  }

  public setSelectedPosition(axis: "x" | "y" | "z", value: number) {
    if (!this.selectedObject) return;
    this.beginSelectedTransform();
    this.selectedObject.position[axis] = value;
    this.renderer.invalidate(
      PtInvalidationLevel.Geometry,
      `${this.selectedObject.userData.pathTracer.objectName} position changed`
    );
    this.publishSelection();
  }

  public setSelectedRadius(radius: number) {
    if (!this.selectedObject || !isPtSphereMesh(this.selectedObject)) return;
    this.beginSelectedTransform();
    const sphereIndex = this.selectedObject.userData.pathTracer.primitiveIndex;
    const scale = radius / this.selectedObject.geometry.parameters.radius;
    this.selectedObject.scale.setScalar(scale);
    this.renderer.invalidate(
      PtInvalidationLevel.Geometry,
      `sphere ${sphereIndex} radius changed`
    );
    this.publishSelection();
  }

  public setSelectedQuadSize(axis: "width" | "height", value: number) {
    if (!this.selectedObject || !isPtQuadMesh(this.selectedObject)) return;
    this.beginSelectedTransform();
    this.selectedObject.scale[axis === "width" ? "x" : "y"] = value;
    this.renderer.invalidate(PtInvalidationLevel.Geometry, `quad ${axis} changed`);
    this.publishSelection();
  }

  public setSelectedRotation(axis: "x" | "y" | "z", degrees: number) {
    if (!this.selectedObject) return;
    this.beginSelectedTransform();
    this.selectedObject.rotation[axis] = THREE.MathUtils.degToRad(degrees);
    this.renderer.invalidate(PtInvalidationLevel.Geometry, "object rotation changed");
    this.publishSelection();
  }

  public beginSelectedLightEdit() {
    const object = this.selectedObject;
    if (!object || !isPtAnalyticLightNode(object) || this.pendingAnalyticLight) return;
    this.pendingAnalyticLight = {
      object,
      before: this.captureAnalyticLight(object),
    };
  }

  public setSelectedLightEnabled(enabled: boolean) {
    const object = this.selectedObject;
    if (!object || !isPtAnalyticLightNode(object)) return;
    this.beginSelectedLightEdit();
    object.userData.pathTracer.enabled = enabled;
    syncAnalyticLightPreview(object);
    this.renderer.invalidate(PtInvalidationLevel.Material, "analytic light enabled state changed");
    this.publishSelection();
  }

  public setAnalyticLightEnabled(objectId: string, enabled: boolean) {
    const object = this.renderer.ptScene
      .getAnalyticLightNodes()
      .find((light) => light.userData.pathTracer.objectId === objectId);
    if (!object || object.userData.pathTracer.enabled === enabled) return;
    this.commitSelectedTransform();
    this.commitMaterialEdit();
    this.commitSelectedLightEdit();
    const before = this.captureAnalyticLight(object);
    const after = { ...before, enabled };
    this.applyAnalyticLight(object, after);
    this.history.record({
      label: `${enabled ? "Enable" : "Disable"} ${object.userData.pathTracer.objectName}`,
      execute: () => this.applyAnalyticLight(object, after),
      undo: () => this.applyAnalyticLight(object, before),
    });
    this.publishSceneObjects();
    this.publishHistory();
  }

  public setSelectedLightColor(color: THREE.Color) {
    const object = this.selectedObject;
    if (!object || !isPtAnalyticLightNode(object)) return;
    this.beginSelectedLightEdit();
    object.userData.pathTracer.color.copy(color);
    syncAnalyticLightPreview(object);
    this.renderer.invalidate(PtInvalidationLevel.Material, "analytic light color changed");
    this.publishSelection();
  }

  public setSelectedLightIntensity(intensity: number) {
    const object = this.selectedObject;
    if (!object || !isPtAnalyticLightNode(object)) return;
    this.beginSelectedLightEdit();
    object.userData.pathTracer.intensity = intensity;
    syncAnalyticLightPreview(object);
    this.renderer.invalidate(PtInvalidationLevel.Material, "analytic light intensity changed");
    this.publishSelection();
  }

  public setSelectedLightAngularDiameter(angularDiameter: number) {
    const object = this.selectedObject;
    if (!object || !isPtAnalyticLightNode(object)) return;
    this.beginSelectedLightEdit();
    object.userData.pathTracer.angularDiameter = angularDiameter;
    this.renderer.invalidate(PtInvalidationLevel.Material, "sun angular diameter changed");
    this.publishSelection();
  }

  public setSelectedSpotCone(
    property: "innerConeAngle" | "outerConeAngle",
    angle: number
  ) {
    const object = this.selectedObject;
    if (!object || !isPtAnalyticLightNode(object)) return;
    this.beginSelectedLightEdit();
    const metadata = object.userData.pathTracer;
    metadata[property] = angle;
    if (property === "innerConeAngle") {
      metadata.innerConeAngle = Math.min(angle, metadata.outerConeAngle);
    } else {
      metadata.outerConeAngle = Math.max(angle, metadata.innerConeAngle);
    }
    syncAnalyticLightPreview(object);
    this.renderer.invalidate(PtInvalidationLevel.Material, "spot cone changed");
    this.publishSelection();
  }

  public commitSelectedLightEdit() {
    const pending = this.pendingAnalyticLight;
    this.pendingAnalyticLight = null;
    if (!pending) return false;
    const after = this.captureAnalyticLight(pending.object);
    if (this.analyticLightsEqual(pending.before, after)) return false;
    this.history.record({
      label: `Edit ${pending.object.userData.pathTracer.objectName}`,
      execute: () => this.applyAnalyticLight(pending.object, after),
      undo: () => this.applyAnalyticLight(pending.object, pending.before),
    });
    this.publishHistory();
    return true;
  }

  public cancelSelectedLightEdit() {
    const pending = this.pendingAnalyticLight;
    this.pendingAnalyticLight = null;
    if (!pending) return false;
    this.applyAnalyticLight(pending.object, pending.before);
    return true;
  }

  public setSelectedUvMapping(mapping: "spherical" | "box") {
    const object = this.selectedObject;
    if (!object || !isPtSphereMesh(object)) return false;
    const before = object.userData.pathTracer.uvMapping;
    const after = mapping === "box" ? 1 : 0;
    if (before === after) return false;
    const apply = (value: 0 | 1) => {
      object.userData.pathTracer.uvMapping = value;
      this.renderer.invalidate(PtInvalidationLevel.Geometry, `sphere ${object.userData.pathTracer.primitiveIndex} UV mapping changed`);
      if (this.selectedObject === object) this.publishSelection();
    };
    apply(after);
    this.history.record({
      label: `Set ${mapping} UV mapping`,
      execute: () => apply(after),
      undo: () => apply(before),
    });
    this.publishHistory();
    return true;
  }

  public syncSelectedTransform() {
    if (!this.selectedObject) return;
    if (isPtSphereMesh(this.selectedObject) && this.renderer.transformControls.mode === "scale") {
      const scale = this.selectedObject.scale.x;
      this.selectedObject.scale.setScalar(scale);
    }
    this.publishSelection();
  }

  public beginSelectedTransform() {
    if (!this.selectedObject || this.pendingTransform) return;
    this.pendingTransform = {
      object: this.selectedObject,
      before: this.captureTransform(this.selectedObject),
    };
  }

  public commitSelectedTransform() {
    const pending = this.pendingTransform;
    this.pendingTransform = null;
    if (!pending) return false;

    const after = this.captureTransform(pending.object);
    if (this.transformsEqual(pending.before, after)) return false;

    const apply = (snapshot: TransformSnapshot) => {
      pending.object.position.copy(snapshot.position);
      pending.object.quaternion.copy(snapshot.quaternion);
      pending.object.scale.copy(snapshot.scale);
      this.renderer.invalidate(
        PtInvalidationLevel.Geometry,
        `${pending.object.userData.pathTracer.objectName} transform history applied`
      );
      if (this.selectedObject === pending.object) this.publishSelection();
    };

    this.history.record({
      label: `Transform ${pending.object.userData.pathTracer.objectName}`,
      execute: () => apply(after),
      undo: () => apply(pending.before),
    });
    this.publishHistory();
    return true;
  }

  public cancelSelectedTransform() {
    const pending = this.pendingTransform;
    this.pendingTransform = null;
    if (!pending) return false;
    pending.object.position.copy(pending.before.position);
    pending.object.quaternion.copy(pending.before.quaternion);
    pending.object.scale.copy(pending.before.scale);
    this.renderer.invalidate(
      PtInvalidationLevel.Geometry,
      `${pending.object.userData.pathTracer.objectName} transform canceled`
    );
    if (this.selectedObject === pending.object) this.publishSelection();
    return true;
  }

  public setMaterialColor(materialId: number, color: THREE.Color) {
    this.beginMaterialEdit(materialId);
    const material = this.renderer.ptScene.getMaterial(materialId);
    material.color.copy(color);
    const metadata = getMaterialMetadata(material);
    const input = metadata.materialDefinition.model === PtMaterialType.Emissive
      ? metadata.materialDefinition.emission.color
      : metadata.materialDefinition.baseColor;
    if (input.texture.type === PtTextureType.Constant) {
      input.texture.color.copy(color);
      input.factor.set(0xffffff);
    } else {
      input.factor.copy(color);
    }
    this.renderer.invalidate(
      PtInvalidationLevel.Material,
      `material ${materialId} color changed`
    );
    this.publishSelection();
  }

  public setMaterialFuzz(materialId: number, fuzz: number) {
    this.beginMaterialEdit(materialId);
    const material = this.renderer.ptScene.getMaterial(materialId);
    if (material instanceof THREE.MeshStandardMaterial) {
      const model = getMaterialMetadata(material).materialDefinition.model;
      material.roughness = model === PtMaterialModel.LegacyFuzzyMetal
        ? legacyFuzzToPreviewRoughness(fuzz)
        : fuzz;
    }
    getMaterialMetadata(material).materialDefinition.roughness = fuzz;
    this.renderer.invalidate(
      PtInvalidationLevel.Material,
      `material ${materialId} fuzz changed`
    );
    this.publishSelection();
  }

  public setMaterialMetallic(materialId: number, metallic: number) {
    this.beginMaterialEdit(materialId);
    const material = this.renderer.ptScene.getMaterial(materialId);
    if (material instanceof THREE.MeshStandardMaterial) material.metalness = metallic;
    getMaterialMetadata(material).materialDefinition.metallic = metallic;
    this.renderer.invalidate(PtInvalidationLevel.Material, `material ${materialId} metallic changed`);
    this.publishSelection();
  }

  public setMaterialIor(materialId: number, ior: number) {
    this.beginMaterialEdit(materialId);
    const material = this.renderer.ptScene.getMaterial(materialId);
    if (material instanceof THREE.MeshPhysicalMaterial) material.ior = ior;
    getMaterialMetadata(material).materialDefinition.ior = ior;
    this.renderer.invalidate(
      PtInvalidationLevel.Material,
      `material ${materialId} index of refraction changed`
    );
    this.publishSelection();
  }

  public setMaterialEmissionStrength(materialId: number, strength: number) {
    this.beginMaterialEdit(materialId);
    const metadata = getMaterialMetadata(this.renderer.ptScene.getMaterial(materialId));
    metadata.emissionStrength = strength;
    metadata.materialDefinition.emission.strength = strength;
    const material = this.renderer.ptScene.getMaterial(materialId);
    if (material instanceof THREE.MeshStandardMaterial) material.emissiveIntensity = strength;
    this.renderer.invalidate(PtInvalidationLevel.Material, `material ${materialId} emission changed`);
    this.publishSelection();
  }

  public setMaterialEmissionColor(materialId: number, color: THREE.Color) {
    this.beginMaterialEdit(materialId);
    const material = this.renderer.ptScene.getMaterial(materialId);
    const input = getMaterialMetadata(material).materialDefinition.emission.color;
    input.factor.copy(color);
    if (material instanceof THREE.MeshStandardMaterial) {
      material.emissive.copy(input.textureEnabled ? color : new THREE.Color(0x000000));
    }
    this.renderer.invalidate(PtInvalidationLevel.Material, `material ${materialId} emission color changed`);
    this.publishSelection();
  }

  public setMaterialTextureSlotImage(
    materialId: number,
    slot: "baseColor" | "metallicRoughness" | "emission",
    source: string
  ) {
    this.replaceMaterialTextureSlot(materialId, slot, imageTexture(source), `Set ${slot} texture`);
  }

  public removeMaterialTextureSlot(
    materialId: number,
    slot: "baseColor" | "metallicRoughness" | "emission"
  ) {
    this.replaceMaterialTextureSlot(materialId, slot, constantTexture(0xffffff), `Remove ${slot} texture`);
  }

  public setMaterialTextureSlotEnabled(
    materialId: number,
    slot: "baseColor" | "metallicRoughness" | "emission",
    enabled: boolean
  ) {
    this.commitMaterialEdit();
    const before = this.captureMaterial(materialId);
    const after = {
      ...before,
      baseColorTextureEnabled: slot === "baseColor" ? enabled : before.baseColorTextureEnabled,
      metallicRoughnessTextureEnabled: slot === "metallicRoughness"
        ? enabled : before.metallicRoughnessTextureEnabled,
      emissionTextureEnabled: slot === "emission" ? enabled : before.emissionTextureEnabled,
    };
    this.applyMaterialHistory(materialId, after);
    this.history.record({
      label: `${enabled ? "Enable" : "Disable"} ${slot} texture`,
      execute: () => this.applyMaterialHistory(materialId, after),
      undo: () => this.applyMaterialHistory(materialId, before),
    });
    this.publishHistory();
  }

  public setMaterialEmissionTwoSided(materialId: number, twoSided: boolean) {
    this.commitMaterialEdit();
    const before = this.captureMaterial(materialId);
    const after = { ...before, emissionTwoSided: twoSided };
    this.applyMaterialHistory(materialId, after);
    this.history.record({
      label: `${twoSided ? "Enable" : "Disable"} two-sided emission`,
      execute: () => this.applyMaterialHistory(materialId, after),
      undo: () => this.applyMaterialHistory(materialId, before),
    });
    this.publishHistory();
  }

  public setMaterialImage(materialId: number, source: string, label = "Image") {
    this.commitMaterialEdit();
    const before = this.captureMaterial(materialId);
    const after = { ...before, texture: imageTexture(source) };
    this.applyMaterial(materialId, after);
    this.renderer.invalidate(PtInvalidationLevel.Material, `material ${materialId} texture changed`);
    this.history.record({
      label: `Set ${label} texture`,
      execute: () => this.applyMaterialHistory(materialId, after),
      undo: () => this.applyMaterialHistory(materialId, before),
    });
    this.publishHistory();
  }

  public removeMaterialTexture(materialId: number) {
    this.commitMaterialEdit();
    const before = this.captureMaterial(materialId);
    if (before.texture.type === PtTextureType.Constant) return false;
    const after = { ...before, texture: constantTexture(before.color) };
    this.applyMaterial(materialId, after);
    this.renderer.invalidate(PtInvalidationLevel.Material, `material ${materialId} texture removed`);
    this.history.record({
      label: "Remove texture",
      execute: () => this.applyMaterialHistory(materialId, after),
      undo: () => this.applyMaterialHistory(materialId, before),
    });
    this.publishHistory();
    return true;
  }

  public setMaterialChecker(materialId: number) {
    this.replaceMaterialTexture(materialId, checkerTexture(0x183a1d, 0xb7d66b, 10), "Checker");
  }

  public setMaterialPerlin(materialId: number) {
    this.replaceMaterialTexture(materialId, perlinTexture(), "Perlin marble");
  }

  public setTextureColor(materialId: number, channel: "colorA" | "colorB", color: THREE.Color) {
    this.updateProceduralTexture(materialId, (texture) => { texture[channel].copy(color); });
  }

  public setTextureScale(materialId: number, scale: number) {
    this.updateProceduralTexture(materialId, (texture) => { texture.scale = scale; });
  }

  public setTextureTurbulence(materialId: number, turbulence: number) {
    this.updateProceduralTexture(materialId, (texture) => {
      if (texture.type === PtTextureType.Perlin) texture.turbulence = turbulence;
    });
  }

  public beginMaterialEdit(materialId: number) {
    if (this.pendingMaterial) return;
    this.pendingMaterial = {
      materialId,
      before: this.captureMaterial(materialId),
    };
  }

  public commitMaterialEdit() {
    const pending = this.pendingMaterial;
    this.pendingMaterial = null;
    if (!pending) return false;

    const after = this.captureMaterial(pending.materialId);
    if (this.materialsEqual(pending.before, after)) return false;
    const apply = (snapshot: MaterialSnapshot) => {
      this.applyMaterial(pending.materialId, snapshot);
      this.renderer.invalidate(
        PtInvalidationLevel.Material,
        `material ${pending.materialId} history applied`
      );
    };

    this.history.record({
      label: `Edit material ${pending.materialId}`,
      execute: () => apply(after),
      undo: () => apply(pending.before),
    });
    this.publishHistory();
    return true;
  }

  public cancelMaterialEdit() {
    const pending = this.pendingMaterial;
    this.pendingMaterial = null;
    if (!pending) return false;
    this.applyMaterial(pending.materialId, pending.before);
    this.renderer.invalidate(
      PtInvalidationLevel.Material,
      `material ${pending.materialId} edit canceled`
    );
    return true;
  }

  private updateSetting<Key extends keyof PtSettings>(
    key: Key,
    value: PtSettings[Key]
  ) {
    this.store.update((state) => ({
      ...state,
      settings: { ...state.settings, [key]: value },
    }));
  }

  private publishSelection() {
    if (!this.selectedObject) return;
    const selectedObject = this.selectedObject;
    if (isPtAnalyticLightNode(selectedObject)) {
      const metadata = selectedObject.userData.pathTracer;
      const { x, y, z } = selectedObject.position;
      const rotation = selectedObject.rotation;
      this.store.update((state) => ({
        ...state,
        selection: {
          objectId: metadata.objectId,
          name: metadata.objectName,
          sphereIndex: null,
          quadIndex: null,
          kind: metadata.lightType === "point"
            ? "pointLight"
            : metadata.lightType === "directional"
              ? "directionalLight"
              : "spotLight",
          position: { x, y, z },
          rotation: {
            x: THREE.MathUtils.radToDeg(rotation.x),
            y: THREE.MathUtils.radToDeg(rotation.y),
            z: THREE.MathUtils.radToDeg(rotation.z),
          },
          radius: null,
          width: null,
          height: null,
          uvMapping: null,
          material: null,
        light: {
            type: metadata.lightType,
            enabled: metadata.enabled,
            color: `#${metadata.color.getHexString()}`,
            intensity: metadata.intensity,
            angularDiameter: metadata.angularDiameter,
            innerConeAngle: metadata.innerConeAngle,
            outerConeAngle: metadata.outerConeAngle,
        },
        mesh: null,
      },
      }));
      return;
    }
    const sphere = isPtSphereMesh(selectedObject);
    const triangleMesh = isPtTriangleMesh(selectedObject);
    const sphereIndex = sphere ? selectedObject.userData.pathTracer.primitiveIndex : null;
    const quadIndex = isPtQuadMesh(selectedObject) ? selectedObject.userData.pathTracer.primitiveIndex : null;
    const { x, y, z } = selectedObject.position;
    const radius = sphere ? sphereRadius(selectedObject) : null;
    const rotation = selectedObject.rotation;
    const { materialId, materialType, emissionStrength, emissionTwoSided } = getMaterialMetadata(
      selectedObject.material
    );
    const material = this.renderer.ptScene.getMaterial(materialId);
    const definition = getMaterialMetadata(material).materialDefinition;
    const materialKind = materialType === PtMaterialModel.LegacyLambert ? "Lambert"
      : materialType === PtMaterialModel.LegacyFuzzyMetal ? "Metal"
      : materialType === PtMaterialModel.LegacyDielectric ? "Dielectric"
      : materialType === PtMaterialModel.NoBsdf ? "Emissive"
      : materialType === PtMaterialModel.PrincipledMetallicRoughness ? "Principled"
      : "Unknown";
    this.store.update((state) => ({
      ...state,
      selection: {
        objectId: selectedObject.userData.pathTracer.objectId,
        name: selectedObject.userData.pathTracer.objectName,
        sphereIndex,
        quadIndex,
        kind: sphere ? "sphere" : triangleMesh ? "triangleMesh" : "quad",
        position: { x, y, z },
        rotation: {
          x: THREE.MathUtils.radToDeg(rotation.x),
          y: THREE.MathUtils.radToDeg(rotation.y),
          z: THREE.MathUtils.radToDeg(rotation.z),
        },
        radius,
        width: isPtQuadMesh(selectedObject) ? selectedObject.scale.x : null,
        height: isPtQuadMesh(selectedObject) ? selectedObject.scale.y : null,
        uvMapping: sphere
          ? selectedObject.userData.pathTracer.uvMapping === 1 ? "box" : "spherical"
          : null,
        mesh: triangleMesh ? {
          triangleCount: Math.floor((selectedObject.geometry.index?.count ?? selectedObject.geometry.getAttribute("position").count) / 3),
          vertexCount: selectedObject.geometry.getAttribute("position").count,
          indexed: selectedObject.geometry.index !== null,
          wireframeVisible: this.renderer.isTriangleWireframeVisible(
            selectedObject.userData.pathTracer.objectId
          ),
        } : null,
        material: {
          id: materialId,
          kind: materialKind,
          color: `#${definition.baseColor.factor.getHexString()}`,
          roughness: materialType === PtMaterialModel.LegacyFuzzyMetal || materialType === PtMaterialModel.PrincipledMetallicRoughness
            ? definition.roughness : null,
          metallic: materialType === PtMaterialModel.PrincipledMetallicRoughness
            ? definition.metallic : null,
          ior: materialType === PtMaterialModel.LegacyDielectric || materialType === PtMaterialModel.PrincipledMetallicRoughness
            ? definition.ior : null,
          emissionColor: materialType === PtMaterialModel.PrincipledMetallicRoughness
            ? `#${definition.emission.color.factor.getHexString()}` : null,
          emissionStrength: materialType === PtMaterialModel.NoBsdf || materialType === PtMaterialModel.PrincipledMetallicRoughness
            ? emissionStrength : null,
          emissionTwoSided: materialType === PtMaterialModel.NoBsdf || materialType === PtMaterialModel.PrincipledMetallicRoughness
            ? emissionTwoSided : null,
          texture: textureState(definition.baseColor.texture, definition.baseColor.textureEnabled),
          metallicRoughnessTexture: materialType === PtMaterialModel.PrincipledMetallicRoughness
            ? textureState(
                definition.metallicRoughnessTexture,
                definition.metallicRoughnessTextureEnabled
              ) : null,
          emissionTexture: materialType === PtMaterialModel.PrincipledMetallicRoughness
            ? textureState(
                definition.emission.color.texture,
                definition.emission.color.textureEnabled
              ) : null,
        },
        light: null,
      },
    }));
  }

  private createSceneObjectState(
    sceneLabel = this.store.getState().sceneKey
  ): PtState["sceneObjects"] {
    const fixedObjects: PtState["sceneObjects"] = [
      {
        id: "scene:root",
        label: sceneLabel,
        kind: "scene",
        parentId: null,
        depth: 0,
        sphereIndex: null,
        quadIndex: null,
        selectable: false,
        traceable: false,
        capability: "scene",
      },
      {
        id: "camera:main",
        label: "Perspective Camera",
        kind: "camera",
        parentId: "scene:root",
        depth: 1,
        sphereIndex: null,
        quadIndex: null,
        selectable: false,
        traceable: true,
        capability: "path-tracing camera",
      },
      {
        id: "light:ambient",
        label: "Ambient Light",
        kind: "light",
        parentId: "scene:root",
        depth: 1,
        sphereIndex: null,
        quadIndex: null,
        selectable: false,
        traceable: false,
        capability: "preview lighting",
      },
      {
        id: "light:directional",
        label: "Directional Light",
        kind: "light",
        parentId: "scene:root",
        depth: 1,
        sphereIndex: null,
        quadIndex: null,
        selectable: false,
        traceable: false,
        capability: "preview lighting",
      },
      {
        id: "group:lights",
        label: "Lights",
        kind: "group",
        parentId: "scene:root",
        depth: 1,
        sphereIndex: null,
        quadIndex: null,
        selectable: false,
        traceable: false,
        capability: "authored lighting",
      },
      {
        id: "group:traceables",
        label: "Traceable Objects",
        kind: "group",
        parentId: "scene:root",
        depth: 1,
        sphereIndex: null,
        quadIndex: null,
        selectable: false,
        traceable: false,
        capability: "group",
      },
    ];
    const spheres: PtState["sceneObjects"] = this.renderer.ptScene
      .getSphereMeshes()
      .map((sphere) => {
      const sphereIndex = sphere.userData.pathTracer.primitiveIndex;
      const emissive = getMaterialMetadata(sphere.material).materialType === 3;
      return {
        id: sphere.userData.pathTracer.objectId,
        label: sphere.userData.pathTracer.objectName,
        kind: "sphere" as const,
        parentId: emissive ? "group:lights" : "group:traceables",
        depth: 2,
        sphereIndex,
        quadIndex: null,
        selectable: true,
        traceable: true,
        capability: emissive ? "emissive sphere light" : "path traced",
      };
    });
    const quads: PtState["sceneObjects"] = this.renderer.ptScene
      .getQuadMeshes()
      .map((quad) => {
        const emissive =
          getMaterialMetadata(quad.material).materialType === 3;
        return {
          id: quad.userData.pathTracer.objectId,
          label: quad.userData.pathTracer.objectName,
          kind: "quad" as const,
          parentId: emissive ? "group:lights" : "group:traceables",
          depth: 2,
          sphereIndex: null,
          quadIndex: quad.userData.pathTracer.primitiveIndex,
          selectable: true,
          traceable: true,
          capability: emissive ? "emissive quad light" : "path-traced quad",
        };
      });
    const analyticLights: PtState["sceneObjects"] = this.renderer.ptScene
      .getAnalyticLightNodes()
      .map((light) => ({
        id: light.userData.pathTracer.objectId,
        label: light.userData.pathTracer.objectName,
        kind: "light" as const,
        parentId: "group:lights",
        depth: 2,
        sphereIndex: null,
        quadIndex: null,
        selectable: true,
        traceable: true,
        capability: `${light.userData.pathTracer.lightType} light`,
        lightEnabled: light.userData.pathTracer.enabled,
      }));
    const triangleMeshes: PtState["sceneObjects"] = this.renderer.ptScene
      .getTriangleMeshes()
      .map((mesh) => ({
        id: mesh.userData.pathTracer.objectId,
        label: mesh.userData.pathTracer.objectName,
        kind: "triangleMesh" as const,
        parentId: "group:traceables",
        depth: 2,
        sphereIndex: null,
        quadIndex: null,
        selectable: true,
        traceable: true,
        capability: `${mesh.geometry.index ? "indexed " : ""}${Math.floor((mesh.geometry.index?.count ?? mesh.geometry.getAttribute("position").count) / 3)}-triangle mesh`,
      }));
    return [...fixedObjects, ...analyticLights, ...spheres, ...quads, ...triangleMeshes];
  }

  private publishSceneObjects() {
    const sceneObjects = this.createSceneObjectState();
    this.store.update((state) => ({ ...state, sceneObjects }));
  }

  private publishImportWarnings() {
    const importWarnings = [...this.renderer.ptScene.staticAssetWarnings];
    this.store.update((state) => ({ ...state, importWarnings }));
  }

  private captureTransform(object: PtEditableObject): TransformSnapshot {
    return {
      position: object.position.clone(),
      quaternion: object.quaternion.clone(),
      scale: object.scale.clone(),
    };
  }

  private transformsEqual(a: TransformSnapshot, b: TransformSnapshot) {
    return a.position.equals(b.position) && a.quaternion.equals(b.quaternion) && a.scale.equals(b.scale);
  }

  private configureTransformControls() {
    const mode = this.renderer.transformControls.mode;
    const sphere = this.selectedObject ? isPtSphereMesh(this.selectedObject) : false;
    this.renderer.transformControls.showX = true;
    this.renderer.transformControls.showY = mode !== "scale" || !sphere;
    this.renderer.transformControls.showZ = mode !== "scale";
  }

  private captureAnalyticLight(
    object: import("./PtAnalyticLight").PtAnalyticLightNode
  ): AnalyticLightSnapshot {
    const metadata = object.userData.pathTracer;
    return {
      enabled: metadata.enabled,
      color: metadata.color.getHex(),
      intensity: metadata.intensity,
      angularDiameter: metadata.angularDiameter,
      innerConeAngle: metadata.innerConeAngle,
      outerConeAngle: metadata.outerConeAngle,
    };
  }

  private applyAnalyticLight(
    object: import("./PtAnalyticLight").PtAnalyticLightNode,
    snapshot: AnalyticLightSnapshot
  ) {
    const metadata = object.userData.pathTracer;
    metadata.enabled = snapshot.enabled;
    metadata.color.setHex(snapshot.color);
    metadata.intensity = snapshot.intensity;
    metadata.angularDiameter = snapshot.angularDiameter;
    metadata.innerConeAngle = snapshot.innerConeAngle;
    metadata.outerConeAngle = snapshot.outerConeAngle;
    syncAnalyticLightPreview(object);
    this.renderer.invalidate(PtInvalidationLevel.Material, "analytic light history applied");
    if (this.selectedObject === object) this.publishSelection();
    this.publishSceneObjects();
  }

  private analyticLightsEqual(
    a: AnalyticLightSnapshot,
    b: AnalyticLightSnapshot
  ) {
    return a.enabled === b.enabled && a.color === b.color &&
      a.intensity === b.intensity &&
      a.angularDiameter === b.angularDiameter &&
      a.innerConeAngle === b.innerConeAngle &&
      a.outerConeAngle === b.outerConeAngle;
  }

  private captureMaterial(materialId: number): MaterialSnapshot {
    const material = this.renderer.ptScene.getMaterial(materialId);
    const metadata = getMaterialMetadata(material);
    return {
      color: material.color.getHex(),
      roughness: metadata.materialDefinition.roughness,
      metallic: metadata.materialDefinition.metallic,
      ior: metadata.materialDefinition.ior,
      texture: cloneTexture(metadata.texture),
      metallicRoughnessTexture: cloneTexture(
        metadata.materialDefinition.metallicRoughnessTexture
      ),
      emissionTexture: cloneTexture(
        metadata.materialDefinition.emission.color.texture
      ),
      emissionColor: metadata.materialDefinition.emission.color.factor.getHex(),
      baseColorTextureEnabled: metadata.materialDefinition.baseColor.textureEnabled,
      metallicRoughnessTextureEnabled:
        metadata.materialDefinition.metallicRoughnessTextureEnabled,
      emissionTextureEnabled:
        metadata.materialDefinition.emission.color.textureEnabled,
      emissionStrength: metadata.emissionStrength,
      emissionTwoSided: metadata.emissionTwoSided,
    };
  }

  private applyMaterial(materialId: number, snapshot: MaterialSnapshot) {
    const material = this.renderer.ptScene.getMaterial(materialId);
    this.renderer.ptScene.setMaterialTexture(materialId, cloneTexture(snapshot.texture));
    this.renderer.ptScene.setMaterialTextureSlot(
      materialId,
      "metallicRoughness",
      cloneTexture(snapshot.metallicRoughnessTexture)
    );
    this.renderer.ptScene.setMaterialTextureSlot(
      materialId,
      "emission",
      cloneTexture(snapshot.emissionTexture)
    );
    this.renderer.ptScene.setMaterialTextureSlotEnabled(
      materialId, "baseColor", snapshot.baseColorTextureEnabled
    );
    this.renderer.ptScene.setMaterialTextureSlotEnabled(
      materialId, "metallicRoughness", snapshot.metallicRoughnessTextureEnabled
    );
    this.renderer.ptScene.setMaterialTextureSlotEnabled(
      materialId, "emission", snapshot.emissionTextureEnabled
    );
    material.color.setHex(snapshot.color);
    const metadata = getMaterialMetadata(material);
    if (snapshot.texture.type === PtTextureType.Image) {
      metadata.materialDefinition.baseColor.factor.setHex(snapshot.color);
    }
    metadata.emissionStrength = snapshot.emissionStrength;
    metadata.emissionTwoSided = snapshot.emissionTwoSided;
    metadata.materialDefinition.emission.strength = snapshot.emissionStrength;
    metadata.materialDefinition.emission.twoSided = snapshot.emissionTwoSided;
    metadata.materialDefinition.emission.color.factor.setHex(snapshot.emissionColor);
    if (material instanceof THREE.MeshStandardMaterial) {
      material.emissive.setHex(
        snapshot.emissionTextureEnabled ? snapshot.emissionColor : 0x000000
      );
      material.emissiveIntensity = snapshot.emissionStrength;
    }
    if (
      snapshot.roughness !== undefined &&
      material instanceof THREE.MeshStandardMaterial
    ) {
      material.roughness = metadata.materialDefinition.model === PtMaterialModel.LegacyFuzzyMetal
        ? legacyFuzzToPreviewRoughness(snapshot.roughness)
        : snapshot.roughness;
      metadata.materialDefinition.roughness = snapshot.roughness;
    }
    if (snapshot.metallic !== undefined && material instanceof THREE.MeshStandardMaterial) {
      material.metalness = metadata.materialDefinition.model === PtMaterialModel.LegacyFuzzyMetal
        ? LEGACY_FUZZY_METAL_PREVIEW_METALNESS
        : snapshot.metallic;
      metadata.materialDefinition.metallic = snapshot.metallic;
    }
    if (snapshot.ior !== undefined) {
      if (material instanceof THREE.MeshPhysicalMaterial) material.ior = snapshot.ior;
      metadata.materialDefinition.ior = snapshot.ior;
    }
    if (
      this.selectedObject &&
      !isPtAnalyticLightNode(this.selectedObject) &&
      getMaterialMetadata(this.selectedObject.material).materialId === materialId
    ) {
      this.publishSelection();
    }
  }

  private applyMaterialHistory(materialId: number, snapshot: MaterialSnapshot) {
    this.applyMaterial(materialId, snapshot);
    this.renderer.invalidate(PtInvalidationLevel.Material, `material ${materialId} texture history applied`);
  }

  private replaceMaterialTexture(materialId: number, texture: PtTexture, label: string) {
    this.commitMaterialEdit();
    const before = this.captureMaterial(materialId);
    const after = { ...before, texture };
    this.applyMaterial(materialId, after);
    this.renderer.invalidate(PtInvalidationLevel.Material, `material ${materialId} texture changed`);
    this.history.record({
      label: `Set ${label} texture`,
      execute: () => this.applyMaterialHistory(materialId, after),
      undo: () => this.applyMaterialHistory(materialId, before),
    });
    this.publishHistory();
  }

  private replaceMaterialTextureSlot(
    materialId: number,
    slot: "baseColor" | "metallicRoughness" | "emission",
    texture: PtTexture,
    label: string
  ) {
    this.commitMaterialEdit();
    const before = this.captureMaterial(materialId);
    const after = {
      ...before,
      texture: slot === "baseColor" ? texture : before.texture,
      metallicRoughnessTexture: slot === "metallicRoughness"
        ? texture : before.metallicRoughnessTexture,
      emissionTexture: slot === "emission" ? texture : before.emissionTexture,
    };
    this.applyMaterialHistory(materialId, after);
    this.history.record({
      label,
      execute: () => this.applyMaterialHistory(materialId, after),
      undo: () => this.applyMaterialHistory(materialId, before),
    });
    this.publishHistory();
  }

  private updateProceduralTexture(
    materialId: number,
    update: (
      texture: Extract<
        PtTexture,
        { type: typeof PtTextureType.Checker | typeof PtTextureType.Perlin }
      >
    ) => void
  ) {
    this.beginMaterialEdit(materialId);
    const metadata = getMaterialMetadata(this.renderer.ptScene.getMaterial(materialId));
    if (metadata.texture.type !== PtTextureType.Checker && metadata.texture.type !== PtTextureType.Perlin) return;
    const texture = cloneTexture(metadata.texture);
    if (texture.type !== PtTextureType.Checker && texture.type !== PtTextureType.Perlin) return;
    update(texture);
    this.renderer.ptScene.setMaterialTexture(materialId, texture);
    this.renderer.invalidate(PtInvalidationLevel.Material, `material ${materialId} procedural texture changed`);
    this.publishSelection();
  }

  private materialsEqual(a: MaterialSnapshot, b: MaterialSnapshot) {
    return (
      a.color === b.color && a.roughness === b.roughness && a.ior === b.ior &&
      a.metallic === b.metallic &&
      a.emissionStrength === b.emissionStrength &&
      a.emissionColor === b.emissionColor &&
      a.baseColorTextureEnabled === b.baseColorTextureEnabled &&
      a.metallicRoughnessTextureEnabled === b.metallicRoughnessTextureEnabled &&
      a.emissionTextureEnabled === b.emissionTextureEnabled &&
      a.emissionTwoSided === b.emissionTwoSided &&
      JSON.stringify(this.serializeTexture(a.texture)) === JSON.stringify(this.serializeTexture(b.texture)) &&
      JSON.stringify(this.serializeTexture(a.metallicRoughnessTexture)) === JSON.stringify(this.serializeTexture(b.metallicRoughnessTexture)) &&
      JSON.stringify(this.serializeTexture(a.emissionTexture)) === JSON.stringify(this.serializeTexture(b.emissionTexture))
    );
  }

  private serializeTexture(texture: PtTexture) {
    if (texture.type === PtTextureType.Constant) return [texture.type, texture.color.getHex()];
    if (texture.type === PtTextureType.Checker) return [texture.type, texture.colorA.getHex(), texture.colorB.getHex(), texture.scale];
    if (texture.type === PtTextureType.Perlin) return [texture.type, texture.colorA.getHex(), texture.colorB.getHex(), texture.scale, texture.turbulence];
    return [texture.type, texture.source, texture.tint.getHex()];
  }

  private applySettings(settings: PtSettings) {
    const current = this.store.getState().settings;
    if (current.renderMode !== settings.renderMode) {
      this.setRenderMode(settings.renderMode);
    }
    if (current.regionTracingMode !== settings.regionTracingMode) {
      this.setRegionTracingMode(settings.regionTracingMode);
    }
    if (current.comparisonTracingMode !== settings.comparisonTracingMode) {
      this.setComparisonTracingMode(settings.comparisonTracingMode);
    }
    if (current.backgroundColorTop !== settings.backgroundColorTop) {
      this.setBackgroundColorTop(settings.backgroundColorTop);
    }
    if (current.backgroundColorBottom !== settings.backgroundColorBottom) {
      this.setBackgroundColorBottom(settings.backgroundColorBottom);
    }
    if (
      current.environmentMode !== settings.environmentMode ||
      current.environmentSource !== settings.environmentSource
    ) {
      if (settings.environmentMode === "gradient") this.setEnvironmentGradient();
      else this.setEnvironmentMap(settings.environmentSource, settings.environmentLabel);
    }
    if (current.environmentRotation !== settings.environmentRotation) {
      this.setEnvironmentRotation(settings.environmentRotation);
    }
    if (current.environmentIntensity !== settings.environmentIntensity) {
      this.setEnvironmentIntensity(settings.environmentIntensity);
    }
    if (current.environmentLightingIntensity !== settings.environmentLightingIntensity) {
      this.setEnvironmentLightingIntensity(settings.environmentLightingIntensity);
    }
    if (current.environmentBackgroundVisible !== settings.environmentBackgroundVisible) {
      this.setEnvironmentBackgroundVisible(settings.environmentBackgroundVisible);
    }
    if (current.environmentLightingEnabled !== settings.environmentLightingEnabled) {
      this.setEnvironmentLightingEnabled(settings.environmentLightingEnabled);
    }
    if (current.cameraProjectionMode !== settings.cameraProjectionMode) {
      this.setCameraProjectionMode(settings.cameraProjectionMode);
    }
    if (current.fov !== settings.fov) this.setFov(settings.fov);
    if (current.orthographicHeight !== settings.orthographicHeight) {
      this.setOrthographicHeight(settings.orthographicHeight);
    }
    if (current.numSamples !== settings.numSamples) {
      this.setNumSamples(settings.numSamples);
    }
    if (current.maxRayDepth !== settings.maxRayDepth) {
      this.setMaxRayDepth(settings.maxRayDepth);
    }
    if (current.integratorMode !== settings.integratorMode) {
      this.setIntegratorMode(settings.integratorMode);
    }
    if (current.triangleTraversalMode !== settings.triangleTraversalMode) {
      this.setTriangleTraversalMode(settings.triangleTraversalMode);
    }
    if (current.triangleOverlayMode !== settings.triangleOverlayMode) {
      this.setTriangleOverlayMode(settings.triangleOverlayMode);
    }
    if (current.bvhOverlayEnabled !== settings.bvhOverlayEnabled) {
      this.setBvhOverlayEnabled(settings.bvhOverlayEnabled);
    }
    if (current.bvhOverlayDepth !== settings.bvhOverlayDepth) {
      this.setBvhOverlayDepth(settings.bvhOverlayDepth);
    }
    if (current.resolutionScale !== settings.resolutionScale) {
      this.setResolutionScale(settings.resolutionScale);
    }
    if (current.accumulationFormat !== settings.accumulationFormat) {
      this.setAccumulationFormat(settings.accumulationFormat);
    }
    if (current.maxAccumulationFrames !== settings.maxAccumulationFrames) {
      this.setMaxAccumulationFrames(settings.maxAccumulationFrames);
    }
    if (current.enableDepthOfField !== settings.enableDepthOfField) {
      this.setDepthOfFieldEnabled(settings.enableDepthOfField);
    }
    if (current.aperture !== settings.aperture) {
      this.setAperture(settings.aperture);
    }
    if (current.focusDistance !== settings.focusDistance) {
      this.setFocusDistance(settings.focusDistance);
    }
    if (current.transformMode !== settings.transformMode) {
      this.setTransformMode(settings.transformMode);
    }
    if (current.transformSpace !== settings.transformSpace) {
      this.setTransformSpace(settings.transformSpace);
    }
  }

  private settingsEqual(a: PtSettings, b: PtSettings) {
    return (Object.keys(a) as (keyof PtSettings)[]).every(
      (key) => a[key] === b[key]
    );
  }

  private emptySelection(): PtState["selection"] {
    return {
      objectId: null,
      name: null,
      sphereIndex: null,
      quadIndex: null,
      kind: null,
      position: { x: -1, y: -1, z: -1 },
      rotation: { x: 0, y: 0, z: 0 },
      radius: null,
      width: null,
      height: null,
      uvMapping: null,
      mesh: null,
      material: null,
      light: null,
    };
  }

  private publishHistory() {
    const history = this.history.getSnapshot();
    this.store.update((state) => ({ ...state, history }));
  }
}

function textureState(
  texture: PtTexture,
  enabled: boolean
): import("./PtState").PtTextureState {
  return {
    enabled,
    type: texture.type === PtTextureType.Image ? "image"
      : texture.type === PtTextureType.Checker ? "checker"
      : texture.type === PtTextureType.Perlin ? "perlin" : "constant",
    label: texture.type === PtTextureType.Image
      ? (findBuiltinTexture(texture.source)?.label ?? "Imported image")
      : texture.type === PtTextureType.Checker ? "Checker"
      : texture.type === PtTextureType.Perlin ? "Perlin marble" : "None",
    source: texture.type === PtTextureType.Image ? texture.source : null,
    colorA: texture.type === PtTextureType.Checker || texture.type === PtTextureType.Perlin
      ? `#${texture.colorA.getHexString()}` : null,
    colorB: texture.type === PtTextureType.Checker || texture.type === PtTextureType.Perlin
      ? `#${texture.colorB.getHexString()}` : null,
    scale: texture.type === PtTextureType.Checker || texture.type === PtTextureType.Perlin
      ? texture.scale : null,
    turbulence: texture.type === PtTextureType.Perlin ? texture.turbulence : null,
  };
}
