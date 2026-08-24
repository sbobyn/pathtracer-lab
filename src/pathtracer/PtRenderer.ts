import * as THREE from "three";
import { ShaderCanvas } from "../utils/ShaderCanvas";
import fragShader from "./shaders/main.fs";
import {
  EffectComposer,
  GammaCorrectionShader,
  OutlinePass,
  RenderPass,
  ShaderPass,
  TransformControls,
  OrbitControls,
} from "three/examples/jsm/Addons.js";
import PtScene, { type PtEditableObject } from "./PtScene";
import type { PtSettings } from "./PtState";
import type PtUniforms from "./PtUniforms";
import {
  PtInvalidationLevel,
  type PtInvalidationEvent,
} from "./PtInvalidation";
import GpuScene from "./GpuScene";
import SceneCompiler from "./SceneCompiler";

function integratorModeValue(mode: PtSettings["integratorMode"]): number {
  if (mode === "direct") return 1;
  if (mode === "mis") return 2;
  return 0;
}

export default class PtRenderer {
  public ptScene: PtScene;
  public camera: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;
  private clock: THREE.Clock;

  public shaderCanvas!: ShaderCanvas;

  private composer: EffectComposer;
  private gammaCorrectionPass!: ShaderPass;
  public ptPass!: RenderPass;
  public renderPass!: RenderPass;
  public outlinePass!: OutlinePass;

  public orbitControls!: OrbitControls;
  public transformControls!: TransformControls;

  private gizmo!: THREE.Object3D;
  private gizmoScene!: THREE.Scene;

  public settings: PtSettings;
  public uniforms: PtUniforms;
  private readonly sceneCompiler = new SceneCompiler();
  private gpuScene: GpuScene;
  private readonly fallbackImageTexture = new THREE.DataTexture(
    new Uint8Array([255, 0, 255, 255]),
    1,
    1,
    THREE.RGBAFormat
  );
  private readonly watchedImageTextures = new WeakSet<THREE.Texture>();
  private watchedEnvironmentLoad: Promise<THREE.Texture> | null = null;

  private cameraForward!: THREE.Vector3;
  private cameraUp!: THREE.Vector3;
  private cameraRight!: THREE.Vector3;
  private worldUp!: THREE.Vector3;

  private canvas: HTMLCanvasElement;
  private invalidationSequence = 0;
  private readonly invalidationHistory: PtInvalidationEvent[] = [];

  private readonly handleResize = () => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const pixelRatio = Math.min(window.devicePixelRatio, 2);

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.updateCameraProjectionUniforms();

    this.shaderCanvas.setDimensions(width, height);
    this.composer.setSize(width, height);
    this.composer.setPixelRatio(pixelRatio);
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(pixelRatio);
    this.invalidate(PtInvalidationLevel.Camera, "viewport resized");
  };

  private readonly handleOrbitChange = () => {
    this.invalidate(PtInvalidationLevel.Camera, "orbit camera changed");
  };

  private readonly handleTransformChange = () => {
    if (this.transformControls.dragging) {
      this.invalidate(PtInvalidationLevel.Geometry, "object transform dragged");
    }
  };

  private readonly handleDraggingChanged = (event: { value: unknown }) => {
    this.orbitControls.enabled = !event.value;
  };

  constructor(canvas: HTMLCanvasElement, ptScene: PtScene, settings: PtSettings) {
    this.canvas = canvas;
    this.ptScene = ptScene;
    this.camera = ptScene.camera;

    this.settings = settings;
    this.fallbackImageTexture.needsUpdate = true;
    this.gpuScene = this.sceneCompiler.compile(ptScene);

    this.setupRenderer();
    this.setupControls();
    this.setupCamera();
    this.uniforms = this.createUniforms();
    this.setupShaderCanvas();
    this.watchImageTextures(this.gpuScene);
    this.watchEnvironmentTexture();

    // Setup Post Processing / Composer Passes
    const renderTarget = new THREE.WebGLRenderTarget(
      0,
      0, // will be set by composer.setSize later
      {
        samples: window.devicePixelRatio === 1 ? 2 : 0,
      }
    );
    this.composer = new EffectComposer(this.renderer, renderTarget);
    this.initializeComposerPasses();

    this.setupGizmo();

    // Set Render Loop

    this.clock = new THREE.Clock();
    this.renderer.setAnimationLoop(this.renderLoop);

    // Event listeners
    this.attachEventListeners();
  }

  setupRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.autoClear = false;
  }

  setScene(ptScene: PtScene, invalidate = true) {
    this.gpuScene.dispose();
    this.ptScene = ptScene;
    this.gpuScene = this.sceneCompiler.compile(ptScene);
    this.watchImageTextures(this.gpuScene);
    this.watchEnvironmentTexture();
    this.camera = ptScene.camera;
    this.reset();
    if (invalidate) {
      this.invalidate(PtInvalidationLevel.Scene, "scene preset replaced");
    }
  }

  public setPathtracingEnabled(enabled: boolean) {
    this.settings.pathtracingEnabled = enabled;
    this.ptPass.enabled = enabled;
    this.renderPass.enabled = !enabled;
    this.invalidate(PtInvalidationLevel.Settings, "render mode changed");
  }

  public setFov(fov: number, invalidate = true) {
    this.settings.fov = fov;
    this.camera.fov = fov;
    this.camera.updateProjectionMatrix();
    this.updateCameraProjectionUniforms();
    if (invalidate) {
      this.invalidate(PtInvalidationLevel.Camera, "camera field of view changed");
    }
  }

  public setNumSamples(samples: number, invalidate = true) {
    this.settings.numSamples = samples;
    this.uniforms.uNumSamples.value = samples;
    if (invalidate) {
      this.invalidate(PtInvalidationLevel.Settings, "samples per frame changed");
    }
  }

  public setMaxRayDepth(depth: number) {
    this.settings.maxRayDepth = depth;
    this.uniforms.uMaxRayDepth.value = depth;
    this.invalidate(PtInvalidationLevel.Settings, "maximum ray depth changed");
  }

  public setIntegratorMode(mode: PtSettings["integratorMode"]) {
    this.settings.integratorMode = mode;
    this.uniforms.uIntegratorMode.value = integratorModeValue(mode);
    this.invalidate(PtInvalidationLevel.Settings, "integrator mode changed");
  }

  public setDepthOfFieldEnabled(enabled: boolean, invalidate = true) {
    this.settings.enableDepthOfField = enabled;
    this.uniforms.uEnableDoF.value = enabled;
    if (invalidate) {
      this.invalidate(PtInvalidationLevel.Camera, "depth of field toggled");
    }
  }

  public setAperture(aperture: number) {
    this.settings.aperture = aperture;
    this.uniforms.uCamera.value.aperture = aperture;
    this.invalidate(PtInvalidationLevel.Camera, "camera aperture changed");
  }

  public setFocusDistance(distance: number) {
    this.settings.focusDistance = distance;
    this.uniforms.uCamera.value.focusDistance = distance;
    this.invalidate(PtInvalidationLevel.Camera, "camera focus distance changed");
  }

  public setResolutionScale(scale: number) {
    this.settings.resolutionScale = scale;
    this.shaderCanvas.setResolutionScale(scale);
    this.invalidate(PtInvalidationLevel.Settings, "resolution scale changed");
  }

  public setAccumulationFormat(format: PtSettings["accumulationFormat"]) {
    this.settings.accumulationFormat = format;
    this.shaderCanvas.setAccumulationFormat(format);
    this.invalidate(PtInvalidationLevel.Settings, "accumulation format changed");
  }

  public setMaxAccumulationFrames(frames: number) {
    this.settings.maxAccumulationFrames = frames;
    this.shaderCanvas.setMaxAccumulationFrames(frames);
    this.invalidate(
      PtInvalidationLevel.Settings,
      "maximum accumulation frames changed"
    );
  }

  public frameObject(object: PtEditableObject) {
    const bounds = new THREE.Box3().setFromObject(object);
    const center = bounds.getCenter(new THREE.Vector3());
    const radius = Math.max(0.001, bounds.getBoundingSphere(new THREE.Sphere()).radius);
    const viewDirection = this.camera.position
      .clone()
      .sub(this.orbitControls.target)
      .normalize();
    const distance = Math.max(1.5, radius * 4);
    this.orbitControls.target.copy(center);
    this.camera.position
      .copy(center)
      .addScaledVector(viewDirection, distance);
    this.orbitControls.update();
    this.invalidate(PtInvalidationLevel.Camera, "selected object framed");
  }

  public invalidate(level: PtInvalidationLevel, reason: string) {
    if (level >= PtInvalidationLevel.Material) {
      this.sceneCompiler.update(this.gpuScene, this.ptScene, level);
      this.updateSceneUniforms();
      this.watchImageTextures(this.gpuScene);
      if (level === PtInvalidationLevel.Scene) this.updateShaderCanvas();
    }
    this.invalidationHistory.push({
      sequence: ++this.invalidationSequence,
      level,
      reason,
    });
    if (this.invalidationHistory.length > 50) this.invalidationHistory.shift();

    // Higher levels intentionally share today's reset consequence while
    // preserving distinct future upload, BVH refit/rebuild, and compile paths.
    this.shaderCanvas.resetAccumulation();
  }

  public getInvalidationHistory(): readonly PtInvalidationEvent[] {
    return [...this.invalidationHistory];
  }

  private reset() {
    this.setupControls();
    this.setupCamera();
    this.updateUniforms();
    this.updateShaderCanvas();
    this.shaderCanvas.updateMaterial();

    this.updateComposerScene();

    this.setupGizmo();
  }

  private setupShaderCanvas() {
    const capacity = this.sceneUniformCapacity();
    const quadCapacity = this.quadUniformCapacity();
    const lightCapacity = this.lightUniformCapacity();
    this.shaderCanvas = new ShaderCanvas({
      width: window.innerWidth,
      height: window.innerHeight,
      fragmentShader: `#define MAX_SPHERES ${capacity}
       #define MAX_QUADS ${quadCapacity}
       #define MAX_LIGHTS ${lightCapacity}
       ${fragShader}`,
      uniforms: this.uniforms,
      renderer: this.renderer,
      resolutionScale: this.settings.resolutionScale,
      accumulationFormat: this.settings.accumulationFormat,
      maxAccumulationFrames: this.settings.maxAccumulationFrames,
    });
  }

  private updateShaderCanvas() {
    const capacity = this.sceneUniformCapacity();
    const quadCapacity = this.quadUniformCapacity();
    const lightCapacity = this.lightUniformCapacity();
    this.shaderCanvas
      .setShader(`#define MAX_SPHERES ${capacity}
       #define MAX_QUADS ${quadCapacity}
       #define MAX_LIGHTS ${lightCapacity}
       ${fragShader}`);
  }

  private sceneUniformCapacity() {
    return Math.max(
      1,
      this.gpuScene.spheres.length,
      this.gpuScene.materials.length
    );
  }

  private quadUniformCapacity() {
    return Math.max(1, this.gpuScene.quads.length);
  }

  private lightUniformCapacity() {
    // Analytic lights are omitted from the active GPU list when disabled (or
    // when their intensity is zero), but WebGL struct-array uniforms must keep
    // the exact length baked into the current shader. Reserve one slot for
    // every authored analytic light so ordinary property edits can safely pad
    // inactive entries without recompiling the shader.
    const emissiveGeometryLightCount = this.gpuScene.lights.filter(
      (light) => light.kind < 2
    ).length;
    return Math.max(
      1,
      emissiveGeometryLightCount +
        this.ptScene.getAnalyticLightNodes().length
    );
  }

  private setupControls() {
    if (this.orbitControls) {
      this.orbitControls.removeEventListener("change", this.handleOrbitChange);
      this.orbitControls.dispose();
    }

    this.orbitControls = new OrbitControls(this.camera, this.canvas);
    this.orbitControls.rotateSpeed = 0.5;
    this.orbitControls.addEventListener("change", this.handleOrbitChange);
    // this.orbitControls.enableDamping = true;

    if (!this.transformControls) {
      this.transformControls = new TransformControls(
        this.camera,
        this.renderer.domElement
      );
    } else {
      this.transformControls.camera = this.camera;
      this.transformControls.detach();
    }
  }

  private setupCamera() {
    this.cameraForward = new THREE.Vector3();
    this.camera.getWorldDirection(this.cameraForward).normalize();
    this.cameraUp = this.camera.up.clone();
    this.cameraRight = new THREE.Vector3();
    this.cameraRight
      .crossVectors(this.cameraForward, this.cameraUp)
      .normalize();
    this.worldUp = new THREE.Vector3(0, 1, 0);
  }

  private updateUniforms() {
    this.uniforms.uCamera.value.position = this.camera.position;
    this.uniforms.uCamera.value.up = this.cameraUp;
    this.uniforms.uCamera.value.forward = this.cameraForward;
    this.uniforms.uCamera.value.right = this.cameraRight;
    this.updateCameraProjectionUniforms();
    this.uniforms.uCamera.value.focusDistance = this.settings.focusDistance;
    this.uniforms.uCamera.value.aperture = this.settings.aperture;

    this.updateSceneUniforms();

    this.uniforms.uNumSamples.value = this.settings.numSamples;
    this.uniforms.uMaxRayDepth.value = this.settings.maxRayDepth;
    this.uniforms.uIntegratorMode.value = integratorModeValue(this.settings.integratorMode);
    this.uniforms.uBackgroundColorTop.value = this.ptScene.backgroundColorTop;
    this.uniforms.uBackgroundColorBottom.value =
      this.ptScene.backgroundColorBottom;
    this.uniforms.uEnvironmentMap.value =
      this.ptScene.environmentTexture ?? this.fallbackImageTexture;
    this.uniforms.uEnvironmentEnabled.value =
      this.settings.environmentMode === "map" && this.ptScene.environmentTexture !== null;
    this.uniforms.uEnvironmentRotation.value = this.settings.environmentRotation;
    this.uniforms.uEnvironmentIntensity.value = this.settings.environmentIntensity;
    this.uniforms.uEnvironmentBackgroundVisible.value = this.settings.environmentBackgroundVisible;
    this.uniforms.uEnvironmentLightingEnabled.value = this.settings.environmentLightingEnabled;

    this.uniforms.uEnableDoF.value = this.settings.enableDepthOfField;
  }

  private createUniforms(): PtUniforms {
    const verticalFov = THREE.MathUtils.degToRad(this.camera.fov);
    const halfHeight = Math.tan(verticalFov / 2);
    const halfWidth = halfHeight * this.camera.aspect;

    const uniforms: PtUniforms = {
      uCamera: {
        value: {
          position: this.camera.position,
          up: this.cameraUp,
          forward: this.cameraForward,
          right: this.cameraRight,
          halfWidth: halfWidth,
          halfHeight: halfHeight,
          focusDistance: this.settings.focusDistance,
          aperture: this.settings.aperture,
        },
      },
      uWorld: {
        value: {
          spheres: this.uniformSphereValues(),
          quads: this.uniformQuadValues(),
        },
      },
      uSphereCount: { value: this.gpuScene.spheres.length },
      uQuadCount: { value: this.gpuScene.quads.length },
      uLights: { value: this.uniformLightValues() },
      uLightCount: { value: this.gpuScene.lights.length },
      uIntegratorMode: { value: integratorModeValue(this.settings.integratorMode) },
      uNumSamples: { value: this.settings.numSamples },
      uMaxRayDepth: { value: this.settings.maxRayDepth },
      uMaterials: { value: this.uniformMaterialValues() },
      uTextures: { value: this.uniformTextureValues() },
      uImageTexture0: {
        value: this.gpuScene.imageTextures[0] ?? this.fallbackImageTexture,
      },
      uImageTexture1: { value: this.gpuScene.imageTextures[1] ?? this.fallbackImageTexture },
      uImageTexture2: { value: this.gpuScene.imageTextures[2] ?? this.fallbackImageTexture },
      uImageTexture3: { value: this.gpuScene.imageTextures[3] ?? this.fallbackImageTexture },
      uBackgroundColorTop: { value: this.ptScene.backgroundColorTop },
      uBackgroundColorBottom: { value: this.ptScene.backgroundColorBottom },
      uEnvironmentMap: { value: this.ptScene.environmentTexture ?? this.fallbackImageTexture },
      uEnvironmentEnabled: { value: this.settings.environmentMode === "map" && this.ptScene.environmentTexture !== null },
      uEnvironmentBackgroundVisible: { value: this.settings.environmentBackgroundVisible },
      uEnvironmentLightingEnabled: { value: this.settings.environmentLightingEnabled },
      uEnvironmentRotation: { value: this.settings.environmentRotation },
      uEnvironmentIntensity: { value: this.settings.environmentIntensity },
      uEnableDoF: { value: this.settings.enableDepthOfField },
    };
    return uniforms;
  }

  private updateSceneUniforms() {
    this.uniforms.uWorld.value.spheres = this.uniformSphereValues();
    this.uniforms.uWorld.value.quads = this.uniformQuadValues();
    this.uniforms.uSphereCount.value = this.gpuScene.spheres.length;
    this.uniforms.uQuadCount.value = this.gpuScene.quads.length;
    this.uniforms.uLights.value = this.uniformLightValues();
    this.uniforms.uLightCount.value = this.gpuScene.lights.length;
    this.uniforms.uMaterials.value = this.uniformMaterialValues();
    this.uniforms.uTextures.value = this.uniformTextureValues();
    this.uniforms.uImageTexture0.value = this.gpuScene.imageTextures[0] ?? this.fallbackImageTexture;
    this.uniforms.uImageTexture1.value = this.gpuScene.imageTextures[1] ?? this.fallbackImageTexture;
    this.uniforms.uImageTexture2.value = this.gpuScene.imageTextures[2] ?? this.fallbackImageTexture;
    this.uniforms.uImageTexture3.value = this.gpuScene.imageTextures[3] ?? this.fallbackImageTexture;
  }

  private uniformSphereValues() {
    const capacity = this.sceneUniformCapacity();
    const padding = {
      position: new THREE.Vector3(),
      radius: 0,
      materialId: 0,
      uvMapping: 0,
    };
    return Array.from(
      { length: capacity },
      (_, index) => this.gpuScene.spheres[index] ?? padding
    );
  }

  private uniformQuadValues() {
    const capacity = this.quadUniformCapacity();
    const padding = {
      q: new THREE.Vector3(),
      u: new THREE.Vector3(1, 0, 0),
      v: new THREE.Vector3(0, 1, 0),
      normal: new THREE.Vector3(0, 0, 1),
      materialId: 0,
    };
    return Array.from({ length: capacity }, (_, index) => this.gpuScene.quads[index] ?? padding);
  }

  private uniformMaterialValues() {
    const capacity = this.sceneUniformCapacity();
    const fallback = this.gpuScene.materials[0];
    if (!fallback) throw new Error("GpuScene requires at least one material");
    return Array.from(
      { length: capacity },
      (_, index) => this.gpuScene.materials[index] ?? fallback
    );
  }

  private uniformLightValues() {
    const padding = {
      kind: 0 as const,
      primitiveType: 0 as const,
      primitiveIndex: 0,
      materialId: 0,
      area: 1,
      emissionTwoSided: false,
      position: new THREE.Vector3(),
      direction: new THREE.Vector3(),
      color: new THREE.Color(),
      intensity: 0,
      angularDiameter: 0,
      innerConeCos: 1,
      outerConeCos: 1,
    };
    return Array.from(
      { length: this.lightUniformCapacity() },
      (_, index) => this.gpuScene.lights[index] ?? padding
    );
  }

  private uniformTextureValues() {
    const capacity = this.sceneUniformCapacity();
    const fallback = this.gpuScene.textures[0];
    if (!fallback) throw new Error("GpuScene requires at least one texture");
    return Array.from(
      { length: capacity },
      (_, index) => this.gpuScene.textures[index] ?? fallback
    );
  }

  private watchImageTextures(gpuScene: GpuScene) {
    for (const texture of gpuScene.imageTextures) {
      if (this.watchedImageTextures.has(texture)) continue;
      const loaded = texture.userData.pathTracerLoaded;
      if (!(loaded instanceof Promise)) continue;
      this.watchedImageTextures.add(texture);
      loaded.then(() => {
        if (this.gpuScene !== gpuScene) return;
        this.invalidate(PtInvalidationLevel.Material, "image texture loaded");
      });
    }
  }

  public setEnvironmentMap(source: string, label: string) {
    this.ptScene.setEnvironmentMap(source, label);
    this.watchEnvironmentTexture();
    this.invalidate(PtInvalidationLevel.Settings, "environment source changed");
  }

  private watchEnvironmentTexture() {
    const loaded = this.ptScene.environmentLoaded;
    if (!loaded || loaded === this.watchedEnvironmentLoad) return;
    this.watchedEnvironmentLoad = loaded;
    loaded.then(() => {
      if (this.ptScene.environmentLoaded !== loaded) return;
      this.uniforms.uEnvironmentMap.value =
        this.ptScene.environmentTexture ?? this.fallbackImageTexture;
      this.uniforms.uEnvironmentEnabled.value = this.settings.environmentMode === "map";
      this.ptScene.scene.background = this.settings.environmentBackgroundVisible
        ? this.ptScene.environmentTexture
        : null;
      this.ptScene.scene.environment = this.settings.environmentLightingEnabled
        ? this.ptScene.environmentTexture
        : null;
      this.invalidate(PtInvalidationLevel.Settings, "environment map loaded");
    }).catch((error) => console.error("Failed to load environment map", error));
  }

  private initializeComposerPasses() {
    this.renderPass = new RenderPass(this.ptScene.scene, this.camera);
    this.ptPass = new RenderPass(
      this.shaderCanvas.screenScene,
      this.shaderCanvas.screenCamera
    );
    this.outlinePass = new OutlinePass(
      new THREE.Vector2(window.innerWidth * 2, window.innerHeight * 2),
      this.ptScene.scene,
      this.camera
    );

    this.composer.setSize(window.innerWidth, window.innerHeight);
    this.composer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    this.renderPass.enabled = !this.settings.pathtracingEnabled;
    this.composer.addPass(this.renderPass);
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;

    this.composer.addPass(this.ptPass);
    this.ptPass.enabled = this.settings.pathtracingEnabled;

    this.composer.addPass(this.outlinePass);

    this.gammaCorrectionPass = new ShaderPass(GammaCorrectionShader);
    this.composer.addPass(this.gammaCorrectionPass);
  }

  private updateComposerScene() {
    this.renderPass.scene = this.ptScene.scene;
    this.renderPass.camera = this.camera;

    this.outlinePass.selectedObjects = [];
    this.outlinePass.renderScene = this.ptScene.scene;
    this.outlinePass.renderCamera = this.camera;

    this.renderPass.enabled = !this.settings.pathtracingEnabled;
    this.ptPass.enabled = this.settings.pathtracingEnabled;
  }

  public disposePostProcessing() {
    this.outlinePass.dispose();
    this.gammaCorrectionPass.dispose();
    this.composer.dispose();
  }

  private setupGizmo() {
    this.gizmo = this.transformControls.getHelper();
    this.gizmoScene = new THREE.Scene();
    this.gizmoScene.add(this.gizmo);
  }

  private readonly renderLoop = () => {
    this.renderer.clear();

    this.orbitControls?.update();

    if (this.settings.pathtracingEnabled) {
      this.camera.updateMatrixWorld();
      this.camera.updateProjectionMatrix();

      this.camera.getWorldDirection(this.cameraForward).normalize();
      this.cameraRight
        .crossVectors(this.cameraForward, this.worldUp)
        .normalize();
      this.cameraUp
        .crossVectors(this.cameraRight, this.cameraForward)
        .normalize();
      this.shaderCanvas.render(this.renderer);
    }

    // transform controls
    this.transformControls.update(this.clock.getDelta());

    this.composer.render();
    this.renderer.render(this.gizmoScene, this.camera);

  };

  private attachEventListeners() {
    window.addEventListener("resize", this.handleResize);
    this.transformControls.addEventListener(
      "change",
      this.handleTransformChange
    );
    this.transformControls.addEventListener(
      "dragging-changed",
      this.handleDraggingChanged
    );
  }

  private updateCameraProjectionUniforms() {
    const verticalFov = THREE.MathUtils.degToRad(this.camera.fov);
    const halfHeight = Math.tan(verticalFov / 2);
    this.uniforms.uCamera.value.halfHeight = halfHeight;
    this.uniforms.uCamera.value.halfWidth = halfHeight * this.camera.aspect;
  }

  public dispose() {
    this.renderer.setAnimationLoop(null);
    window.removeEventListener("resize", this.handleResize);

    this.orbitControls.removeEventListener("change", this.handleOrbitChange);
    this.orbitControls.dispose();

    this.transformControls.removeEventListener(
      "change",
      this.handleTransformChange
    );
    this.transformControls.removeEventListener(
      "dragging-changed",
      this.handleDraggingChanged
    );
    this.transformControls.detach();
    this.transformControls.dispose();

    this.shaderCanvas.dispose();
    this.gpuScene.dispose();
    this.fallbackImageTexture.dispose();
    this.disposePostProcessing();
    this.renderer.dispose();
  }
}
