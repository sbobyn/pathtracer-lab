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
import PtScene from "./PtScene";
import Stats from "stats.js";
import { setupStats } from "../utils/setupStats";
import type { PtState } from "./PtState";
import type PtUniforms from "./PtUniforms";

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

  public settings: PtState;
  public uniforms: PtUniforms;

  private cameraForward!: THREE.Vector3;
  private cameraUp!: THREE.Vector3;
  private cameraRight!: THREE.Vector3;
  private worldUp!: THREE.Vector3;

  private stats: Stats;

  private canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement, ptScene: PtScene, ptState: PtState) {
    this.canvas = canvas;
    this.ptScene = ptScene;
    this.camera = ptScene.camera;

    this.settings = ptState;

    this.setupRenderer();
    this.setupControls();
    this.setupCamera();
    this.uniforms = this.createUniforms();
    this.setupShaderCanvas();

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
    this.stats = setupStats();
    this.renderer.setAnimationLoop(this.renderLoop.bind(this));

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

  setScene(ptScene: PtScene) {
    this.ptScene = ptScene;
    this.camera = ptScene.camera;
    this.reset();
  }

  private reset() {
    this.setupControls();
    this.setupCamera();
    this.updateUniforms();
    this.updateShaderCanvas();
    this.shaderCanvas.updateMaterial();

    this.updateComposerScene();

    this.setupGizmo();
    this.attachEventListeners();
  }

  private setupShaderCanvas() {
    this.shaderCanvas = new ShaderCanvas({
      width: window.innerWidth,
      height: window.innerHeight,
      fragmentShader: `#define MAX_SPHERES ${this.ptScene.spheres.length}
       ${fragShader}`,
      uniforms: this.uniforms,
      renderer: this.renderer,
      resolutionScale: this.settings.resolutionScale,
      accumulationFormat: this.settings.accumulationFormat,
      maxAccumulationFrames: this.settings.maxAccumulationFrames,
    });
  }

  private updateShaderCanvas() {
    this.shaderCanvas
      .setShader(`#define MAX_SPHERES ${this.ptScene.spheres.length}
       ${fragShader}`);
  }

  private setupControls() {
    this.orbitControls = new OrbitControls(this.camera, this.canvas);
    this.orbitControls.rotateSpeed = 0.5;
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
    const verticalFov = THREE.MathUtils.degToRad(this.camera.fov);
    const halfHeight = Math.tan(verticalFov / 2);
    const halfWidth = halfHeight * this.camera.aspect;

    this.uniforms.uCamera.value.position = this.camera.position;
    this.uniforms.uCamera.value.up = this.cameraUp;
    this.uniforms.uCamera.value.forward = this.cameraForward;
    this.uniforms.uCamera.value.right = this.cameraRight;
    this.uniforms.uCamera.value.halfWidth = halfWidth;
    this.uniforms.uCamera.value.halfHeight = halfHeight;
    this.uniforms.uCamera.value.focusDistance = this.settings.focusDistance;
    this.uniforms.uCamera.value.aperture = this.settings.aperture;

    this.uniforms.uWorld.value.spheres = this.ptScene.spheres;

    this.uniforms.uNumSamples.value = this.settings.numSamples;
    this.uniforms.uMaxRayDepth.value = this.settings.maxRayDepth;
    this.uniforms.uMaterials.value = this.ptScene.materials;

    this.uniforms.uBackgroundColorTop.value = this.ptScene.backgroundColorTop;
    this.uniforms.uBackgroundColorBottom.value =
      this.ptScene.backgroundColorBottom;

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
          spheres: this.ptScene.spheres,
        },
      },
      uNumSamples: { value: this.settings.numSamples },
      uMaxRayDepth: { value: this.settings.maxRayDepth },
      uMaterials: { value: this.ptScene.materials },
      uBackgroundColorTop: { value: this.ptScene.backgroundColorTop },
      uBackgroundColorBottom: { value: this.ptScene.backgroundColorBottom },
      uEnableDoF: { value: this.settings.enableDepthOfField },
    };
    return uniforms;
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

  private renderLoop() {
    this.stats.begin();
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

    this.stats.end();
  }

  private attachEventListeners() {
    window.addEventListener("resize", () => {
      const verticalFov = THREE.MathUtils.degToRad(this.camera.fov);
      const halfHeight = Math.tan(verticalFov / 2);
      const halfWidth = halfHeight * this.camera.aspect;
      this.uniforms.uCamera.value.halfHeight = halfHeight;
      this.uniforms.uCamera.value.halfWidth = halfWidth;

      this.shaderCanvas.setDimensions(window.innerWidth, window.innerHeight);

      this.composer.setSize(window.innerWidth, window.innerHeight);
      this.composer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    });

    this.orbitControls.addEventListener("change", () => {
      this.shaderCanvas.resetAccumulation();
    });

    this.transformControls.addEventListener("change", () => {
      if (this.transformControls.dragging)
        this.shaderCanvas.resetAccumulation();
    });

    this.transformControls.addEventListener("dragging-changed", (event) => {
      this.orbitControls.enabled = !event.value;
    });
  }
}
