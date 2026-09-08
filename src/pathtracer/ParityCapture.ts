import { PresetPtScenes } from './PresetPtScenes';
import PtRenderer from './PtRenderer';
import { createDefaultPtState } from './PtState';
import { canonicalParityJson, paritySha256 } from './ParityProvenance';
import SceneCompiler from './SceneCompiler';
import { summarizeDurations, validateMeasurementWindows } from './ParityTiming';

export interface ParityCaptureOptions {
  sceneKey: string;
  camera: { position: [number, number, number]; target: [number, number, number]; fovDegrees: number };
  width: number;
  height: number;
  samples: number;
  sequenceOffset: number;
  maxRayDepth?: number;
  timeoutMs?: number;
  gpuTiming?: boolean;
  measurement?: { windowSeconds: number; repetitions: number };
}

/** Development harness, not imported by the app. Run in an otherwise idle page. */
export async function captureWebGlParity(options: ParityCaptureOptions) {
  const { width, height, samples, sequenceOffset } = options;
  if (options.measurement) validateMeasurementWindows(options.measurement.windowSeconds, options.measurement.repetitions);
  for (const value of [width, height, samples]) {
    if (!Number.isSafeInteger(value) || value < 1) throw new RangeError('Invalid capture dimensions/sample count.');
  }
  if (!Number.isSafeInteger(sequenceOffset) || sequenceOffset < 0 || !Number.isSafeInteger(sequenceOffset + samples)) {
    throw new RangeError('Invalid sample sequence offset.');
  }
  const factory = PresetPtScenes[options.sceneKey];
  if (!factory) throw new Error('Unknown parity scene.');
  const canvas = document.createElement('canvas');
  canvas.style.cssText = `position:fixed;inset:0;width:${width}px;height:${height}px;pointer-events:none`;
  document.body.appendChild(canvas);
  let renderer: PtRenderer | undefined;
  const started = performance.now();
  let interrupted = false;
  const viewport = [innerWidth, innerHeight, devicePixelRatio];
  const interrupt = () => { interrupted = true; };
  const visibilityChanged = () => { if (document.hidden) interrupt(); };
  window.addEventListener('resize', interrupt);
  document.addEventListener('visibilitychange', visibilityChanged);
  canvas.addEventListener('webglcontextlost', interrupt);
  const deadline = started + (options.timeoutMs ?? 120000);
  const check = () => {
    if (interrupted || viewport[0] !== innerWidth || viewport[1] !== innerHeight || viewport[2] !== devicePixelRatio) throw new Error('Parity run interrupted by viewport, visibility, or context change.');
    if (document.hidden) throw new Error('Parity capture interrupted: page hidden.');
    if (performance.now() > deadline) throw new Error('Parity capture timed out.');
  };
  try {
    const scene = factory();
    let assetsReady = false, assetError: unknown;
    void Promise.all([scene.environmentLoaded, scene.staticAssetsLoaded]).then(
      () => { assetsReady = true; }, error => { assetError = error; assetsReady = true; }
    );
    while (!assetsReady) { check(); await new Promise(resolve => setTimeout(resolve, 20)); }
    if (assetError) throw assetError;
    scene.camera.position.fromArray(options.camera.position);
    scene.camera.up.set(0, 1, 0);
    scene.camera.lookAt(...options.camera.target);
    scene.camera.fov = options.camera.fovDegrees;
    scene.camera.near = 0.1;
    scene.camera.far = 10000;
    scene.camera.aspect = width / height;
    scene.camera.updateProjectionMatrix();
    const settings = { ...createDefaultPtState().settings,
      qualityMode: 'manual' as const, renderMode: 'pathtraced' as const,
      resolutionScale: 1, numSamples: 1, maxRayDepth: options.maxRayDepth ?? 8,
      integratorMode: 'mis' as const, accumulationFormat: 'rgba32f' as const,
      maxAccumulationFrames: 0, enableDepthOfField: false, aperture: 0,
      fov: options.camera.fovDegrees, bvhOverlayEnabled: false,
      triangleOverlayMode: 'off' as const,
      environmentMode: scene.environmentTexture ? 'map' as const : 'gradient' as const,
      environmentSource: scene.environmentSource,
      environmentLabel: scene.environmentLabel,
      environmentIntensity: scene.initialEnvironmentIntensity ?? 1,
      backgroundColorTop: `#${scene.backgroundColorTop.getHexString()}`,
      backgroundColorBottom: `#${scene.backgroundColorBottom.getHexString()}`,
    };
    // Hash renderer-owned logical values, not UUIDs or backend-specific packing.
    const compiled = new SceneCompiler().compile(scene);
    const logicalScene = canonicalParityJson({
      spheres: compiled.spheres, quads: compiled.quads, boxes: compiled.boxes,
      triangles: compiled.triangles, materials: compiled.materials,
      textures: compiled.textures, lights: compiled.lights,
    });
    const logicalSceneSha256 = await paritySha256(new TextEncoder().encode(logicalScene));
    const sceneCounts = { spheres: compiled.spheres.length, quads: compiled.quads.length,
      boxes: compiled.boxes.length, triangles: compiled.triangles.length,
      materials: compiled.materials.length, images: compiled.imageTextures.length };
    // GpuScene shares authored image textures; do not dispose these before rendering.
    renderer = new PtRenderer(canvas, scene, settings);
    const device = renderer.getParityDeviceInfo();
    renderer.setFixedOutputSize(width, height);
    renderer.setCameraPose(scene.camera.position.toArray(), scene.camera.quaternion.toArray());
    const drainTiming = async () => {
      let timing = renderer!.pollParityGpuTiming();
      const queryDeadline = performance.now() + 5000;
      while (timing?.pending && performance.now() < queryDeadline) {
        check(); await new Promise(resolve => setTimeout(resolve, 20));
        timing = renderer!.pollParityGpuTiming();
      }
      if (timing?.pending) throw new Error('GPU timer query completion timed out.');
      return timing;
    };
    const waitForSamples = async (count: number) => {
      while (renderer!.getAccumulatedFrames() < count) {
        renderer!.pollParityGpuTiming();
        check(); await new Promise(resolve => setTimeout(resolve, 10));
      }
    };
    // Let initial invalidation/compilation finish before explicitly resetting RNG.
    await waitForSamples(1);
    const warmupUntil = performance.now() + 5000;
    while (performance.now() < warmupUntil) { check(); await new Promise(resolve => setTimeout(resolve, 20)); }
    renderer.setRenderingPaused(true);
    const measurementRuns = [];
    if (options.measurement) {
      for (let repetition = 1; repetition <= options.measurement.repetitions; repetition++) {
        // Re-warm each repetition, keeping compilation and sequence reset outside its window.
        if (repetition > 1) {
          renderer.setRenderingPaused(false);
          const until = performance.now() + 5000;
          while (performance.now() < until) { check(); await new Promise(resolve => setTimeout(resolve, 20)); }
          renderer.setRenderingPaused(true);
        }
        renderer.resetParitySequence(sequenceOffset);
        renderer.startParityGpuTiming();
        const windowStarted = performance.now();
        renderer.setRenderingPaused(false);
        while (performance.now() - windowStarted < options.measurement.windowSeconds * 1000) {
          check(); renderer.pollParityGpuTiming();
          await new Promise(resolve => setTimeout(resolve, 10));
        }
        renderer.setRenderingPaused(true);
        check();
        const submissionWindowMs = performance.now() - windowStarted;
        const submittedBatches = renderer.getAccumulatedFrames();
        const timing = await drainTiming();
        const completionInclusiveMs = performance.now() - windowStarted;
        if (!submittedBatches) throw new Error('No sample batches submitted in measurement window.');
        const gpuBatchMs = timing?.gpuBatchMs ?? null;
        const cpuSubmissionMs = timing?.cpuSubmissionMs ?? [];
        if (cpuSubmissionMs.length !== submittedBatches) throw new Error('CPU timing count does not match submitted batches.');
        if (gpuBatchMs && gpuBatchMs.length !== submittedBatches) throw new Error('GPU query count does not match submitted batches.');
        measurementRuns.push({ repetition, requestedWindowSeconds: options.measurement.windowSeconds,
          sequenceOffset, maxAccumulationFrames: 0,
          validity: timing?.reason && timing.reason !== 'timer-extension-unavailable' ? 'invalid' : 'valid',
          invalidReason: timing?.reason && timing.reason !== 'timer-extension-unavailable' ? timing.reason : null,
          submissionWindowMs, submittedBatches, samplesPerBatch: 1, framePacing: 'requestAnimationFrame' as const,
          gpuTiming: timing, gpuSummary: gpuBatchMs ? summarizeDurations(gpuBatchMs) : null,
          // All query results imply completed draws. Without them do not infer GPU completion from CPU submissions.
          completionInclusiveMs: gpuBatchMs ? completionInclusiveMs : null,
          completedPixelSamplesPerSecond: gpuBatchMs ? width * height * submittedBatches * 1000 / completionInclusiveMs : null,
          cpuSubmissionMs, cpuSummary: summarizeDurations(cpuSubmissionMs),
          certification: 'exploratory frame-paced measurement; not backend parity certification' });
        renderer.stopParityGpuTiming();
      }
    }
    renderer.setMaxAccumulationFrames(samples);
    renderer.resetParitySequence(sequenceOffset);
    if (options.gpuTiming) renderer.startParityGpuTiming();
    renderer.setRenderingPaused(false);
    await waitForSamples(samples);
    renderer.setRenderingPaused(true);
    const gpuTiming = await drainTiming();
    check();
    const frame = renderer.captureLinearParityFrame();
    if (frame.width !== width || frame.height !== height || frame.batches !== samples || frame.sequenceIndex !== sequenceOffset + samples) throw new Error('Capture does not match requested workload.');
    return { ...frame, sceneKey: options.sceneKey, sequenceOffset,
      logicalSceneSha256, sceneCounts, settings, camera: options.camera, gpuTiming, measurementRuns,
      browser: navigator.userAgent, device,
      deviceConditions: { osVersion: null, powerMode: null, thermalState: null, otherGpuWorkloads: 'not-controlled' },
      elapsedIncludingSetupMs: performance.now() - started,
      measurementKind: options.measurement ? 'exploratory-frame-paced-measurements' as const : 'diagnostic-capture-not-throughput' as const };
  } finally {
    window.removeEventListener('resize', interrupt);
    document.removeEventListener('visibilitychange', visibilityChanged);
    canvas.removeEventListener('webglcontextlost', interrupt);
    renderer?.dispose();
    canvas.remove();
  }
}
