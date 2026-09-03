import * as THREE from "three";
import { configureRasterRenderer } from "./RasterPreviewQuality";
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
  Line2,
  LineGeometry,
  LineMaterial,
  LineSegments2,
  LineSegmentsGeometry,
} from "three/examples/jsm/Addons.js";
import PtScene, {
  syncEmissiveQuadPreview,
  type PtEditableObject,
} from "./PtScene";
import type { PtBvhTraversalState, PtSettings } from "./PtState";
import type PtUniforms from "./PtUniforms";
import {
  PtInvalidationLevel,
  type PtInvalidationEvent,
} from "./PtInvalidation";
import GpuScene from "./GpuScene";
import SceneCompiler from "./SceneCompiler";
import { packTriangleTexture, type PackedTriangleTexture } from "./PackedTriangleTexture";
import { packMaterialTexture, packTextureTexture, type PackedDataTexture } from "./PackedMaterialTextures";
import { packSphereBvh, packTriangleBvh, type PackedTriangleBvh } from "./PackedTriangleBvh";
import { packSphereTexture, type PackedSphereTexture } from "./PackedSphereTexture";
import { describeTriangleBvh, hitTriangleDistance, measureTriangleBvh, traceTriangleBvhTraversal, type TriangleBvhStats } from "./TriangleBvh";
import { describeSphereBvh, hitSphereDistance, traceSphereBvhTraversal } from "./SphereBvh";

function integratorModeValue(mode: PtSettings["integratorMode"]): number {
  if (mode === "direct") return 1;
  if (mode === "mis") return 2;
  return 0;
}

type BvhOverlayNode = {
  index: number;
  depth: number;
  leaf: boolean;
  kind: "triangle" | "sphere";
  boundsMin: THREE.Vector3;
  boundsMax: THREE.Vector3;
};

export default class PtRenderer {
  public ptScene: PtScene;
  public camera: THREE.PerspectiveCamera | THREE.OrthographicCamera;
  private renderer!: THREE.WebGLRenderer;
  private clock: THREE.Clock;

  public shaderCanvas!: ShaderCanvas;

  private composer: EffectComposer;
  private gammaCorrectionPass!: ShaderPass;
  public ptPass!: RenderPass;
  public renderPass!: RenderPass;
  private hybridPass!: RenderPass;
  public outlinePass!: OutlinePass;
  private readonly hybridRasterTarget = new THREE.WebGLRenderTarget(1, 1, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat,
    depthBuffer: true,
  });
  private readonly objectIdTarget = new THREE.WebGLRenderTarget(1, 1, {
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    format: THREE.RGBAFormat,
    type: THREE.UnsignedByteType,
    depthBuffer: true,
  });
  private readonly objectIdMaterials = new Map<string, THREE.ShaderMaterial>();
  private readonly objectIdColors = new Map<string, THREE.Vector3>();
  private readonly objectMaskStencilMaterial = new THREE.MeshBasicMaterial({
    colorWrite: false,
    depthWrite: false,
    // The object-ID composite is authoritative for final visible-surface
    // selection and occlusion. Avoid a separate depth-equality prepass here:
    // transformed analytic sphere/quad proxies can fail exact depth replay
    // even though their object-ID silhouettes are correct.
    depthTest: false,
    side: THREE.DoubleSide,
    stencilWrite: true,
    stencilRef: 1,
    stencilFunc: THREE.AlwaysStencilFunc,
    stencilZPass: THREE.ReplaceStencilOp,
  });
  private readonly selectedObjectIds = new Set<string>();
  private readonly hybridScene = new THREE.Scene();
  private readonly hybridCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly hybridMaterial = new THREE.ShaderMaterial({
    uniforms: {
      tRaster: { value: null },
      tPathtraced: { value: null },
      uSeam: { value: 0.5 },
      uRegion: { value: new THREE.Vector4(0.3, 0.3, 0.7, 0.7) },
      uRegionMode: { value: false },
      tObjectIds: { value: null },
      uSelectedObjectIdColors: {
        value: Array.from({ length: 32 }, () => new THREE.Vector3()),
      },
      uSelectedObjectIdCount: { value: 0 },
      uObjectMode: { value: false },
      uObjectComparisonMode: { value: false },
      uObjectSelectionActive: { value: false },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D tRaster;
      uniform sampler2D tPathtraced;
      uniform float uSeam;
      uniform vec4 uRegion;
      uniform bool uRegionMode;
      uniform sampler2D tObjectIds;
      uniform vec3 uSelectedObjectIdColors[32];
      uniform int uSelectedObjectIdCount;
      uniform bool uObjectMode;
      uniform bool uObjectComparisonMode;
      uniform bool uObjectSelectionActive;
      varying vec2 vUv;
      void main() {
        vec4 raster = texture2D(tRaster, vUv);
        vec4 pathtraced = texture2D(tPathtraced, vUv);
        bool insideRegion =
          vUv.x >= uRegion.x && vUv.y >= uRegion.y &&
          vUv.x <= uRegion.z && vUv.y <= uRegion.w;
        vec3 visibleObjectId = texture2D(tObjectIds, vUv).rgb;
        bool selectedObject = false;
        for (int i = 0; i < 32; i++) {
          if (i >= uSelectedObjectIdCount) break;
          selectedObject = selectedObject || distance(
            visibleObjectId,
            uSelectedObjectIdColors[i]
          ) <= (0.5 / 255.0);
        }
        gl_FragColor = uObjectComparisonMode
          ? (uObjectSelectionActive && selectedObject && vUv.x >= uSeam
              ? pathtraced
              : raster)
          : uObjectMode
          ? (uObjectSelectionActive && selectedObject ? pathtraced : raster)
          : uRegionMode
            ? (insideRegion ? pathtraced : raster)
            : (vUv.x < uSeam ? raster : pathtraced);
      }
    `,
    depthTest: false,
    depthWrite: false,
  });
  private readonly hybridRegion = new THREE.Vector4(0.3, 0.3, 0.7, 0.7);
  private hybridSeam = 0.5;
  private hybridRegionInteractionActive = false;
  private readonly frameTimingListeners = new Set<(frameTimeMs: number) => void>();
  private readonly cameraPoseListeners = new Set<() => void>();
  private previousFrameStartedAt = 0;
  private renderingPaused = false;

  public orbitControls!: OrbitControls;
  public transformControls!: TransformControls;

  private gizmo!: THREE.Object3D;
  private gizmoScene!: THREE.Scene;
  private readonly debugOverlayScene = new THREE.Scene();
  private readonly cameraDebugScene = new THREE.Scene();
  private readonly cameraDebugCamera = new THREE.PerspectiveCamera(42, 1, 0.01, 1000);
  private cameraDebugGroup = new THREE.Group();
  private cameraDebugViewport: { left: number; top: number; width: number; height: number } | null = null;
  private cameraDebugEnabled = true;
  private cameraDebugDirty = true;
  private cameraDebugRayGrid = { columns: 5, rows: 3 };
  private cameraDebugMaxDepth = 1;
  private cameraDebugBvhEnabled = true;
  private cameraDebugBvhDepth = 2;
  private cameraDebugControls: OrbitControls | null = null;
  private cameraDebugUserControlled = false;
  private cameraDebugInteractionActive = false;
  private readonly triangleWireframes = new Map<string, THREE.LineSegments>();
  private readonly triangleWireframeOverrides = new Map<string, boolean>();
  private readonly bvhOverlayNodes: BvhOverlayNode[] = [];
  private readonly bvhOverlayNodesByKey = new Map<string, BvhOverlayNode>();
  private readonly bvhHelpers: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>[] = [];
  private readonly bvhTraversalNodeHelpers: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>[] = [];
  private bvhTraversalState: PtBvhTraversalState | null = null;
  private bvhTraversalInvalidated: (() => void) | null = null;
  private bvhTraversalRay: Line2 | null = null;
  private bvhTraversalTriangle: LineSegments2 | null = null;
  private bvhTraversalHit: LineSegments2 | null = null;
  private selectedTriangleMeshId: string | null = null;

  public settings: PtSettings;
  public uniforms: PtUniforms;
  private readonly sceneCompiler = new SceneCompiler();
  private gpuScene: GpuScene;
  private packedSpheres!: PackedSphereTexture;
  private packedSphereBvh!: PackedTriangleBvh;
  private packedTriangles!: PackedTriangleTexture;
  private packedTriangleBvh!: PackedTriangleBvh;
  private packedMaterials!: PackedDataTexture;
  private packedTextures!: PackedDataTexture;
  private readonly fallbackImageTexture = new THREE.DataTexture(
    new Uint8Array([255, 0, 255, 255]),
    1,
    1,
    THREE.RGBAFormat
  );
  private readonly fallbackEnvironmentDistribution = new THREE.DataTexture(
    new Float32Array([1, 1, 0, 0]), 1, 1, THREE.RGBAFormat, THREE.FloatType
  );
  private readonly watchedImageTextures = new WeakSet<THREE.Texture>();
  private watchedEnvironmentLoad: Promise<THREE.Texture> | null = null;
  private watchedStaticAssetLoad: Promise<void> | null = null;
  private staticSceneLoadedListener: (() => void) | null = null;

  private cameraForward!: THREE.Vector3;
  private cameraUp!: THREE.Vector3;
  private cameraRight!: THREE.Vector3;
  private worldUp!: THREE.Vector3;

  private canvas: HTMLCanvasElement;
  private readonly pendingCaptureRequests: Array<{
    includeOverlays: boolean;
    includePanels: boolean;
    includeInteractionHandles: boolean;
    resolve: (capture: { blob: Blob; width: number; height: number; accumulatedFrames: number }) => void;
    reject: (error: Error) => void;
  }> = [];
  private viewportWidth = 0;
  private viewportHeight = 0;
  private viewportPixelRatio = 0;
  private invalidationSequence = 0;
  private readonly invalidationHistory: PtInvalidationEvent[] = [];

  private readonly handleResize = () => {
    this.syncViewportSize();
  };

  private syncViewportSize() {
    // The canvas's CSS box is the authoritative viewport. macOS window-manager
    // shortcuts can update that box before (or without) useful innerWidth and
    // resize-event values. Measuring it also avoids coupling rendering to the
    // browser chrome or devtools layout.
    const bounds = this.canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(bounds.width));
    const height = Math.max(1, Math.round(bounds.height));
    const pixelRatio = Math.min(window.devicePixelRatio, 2);
    if (
      width === this.viewportWidth &&
      height === this.viewportHeight &&
      pixelRatio === this.viewportPixelRatio
    ) return;

    this.viewportWidth = width;
    this.viewportHeight = height;
    this.viewportPixelRatio = pixelRatio;

    this.updateCameraAspect(width / height);
    this.camera.updateProjectionMatrix();
    this.updateCameraProjectionUniforms();

    this.shaderCanvas.setDimensions(width, height);
    this.resizeHybridTarget(width, height, pixelRatio);
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(width, height);
    this.renderer.setPixelRatio(pixelRatio);
    // CSS owns the displayed size; only resize the WebGL drawing buffer here.
    this.renderer.setSize(width, height, false);
    this.invalidate(PtInvalidationLevel.Camera, "viewport resized");
  }

  private readonly handleOrbitChange = () => {
    this.invalidate(PtInvalidationLevel.Camera, "orbit camera changed");
    this.cameraPoseListeners.forEach((listener) => listener());
  };

  public getCameraPose() {
    const direction = new THREE.Vector3();
    this.camera.getWorldDirection(direction).normalize();
    return {
      position: this.camera.position.toArray() as [number, number, number],
      direction: direction.toArray() as [number, number, number],
    };
  }

  public setCameraPose(
    position: readonly [number, number, number],
    quaternion: readonly [number, number, number, number]
  ) {
    this.camera.position.fromArray(position);
    this.camera.quaternion.fromArray(quaternion);
    const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    this.orbitControls.target.copy(this.camera.position).add(direction);
    this.camera.updateMatrixWorld(true);
    this.orbitControls.update();
    this.invalidate(PtInvalidationLevel.Camera, "authored camera viewed");
    this.cameraPoseListeners.forEach((listener) => listener());
  }

  public onCameraPoseChanged(listener: () => void) {
    this.cameraPoseListeners.add(listener);
    return () => {
      this.cameraPoseListeners.delete(listener);
    };
  }

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
    this.applySceneEnvironmentSettings();
    this.objectIdTarget.texture.colorSpace = THREE.NoColorSpace;
    this.fallbackImageTexture.needsUpdate = true;
    this.fallbackEnvironmentDistribution.needsUpdate = true;
    this.gpuScene = this.sceneCompiler.compile(ptScene);

    this.setupRenderer();
    this.packedSpheres = packSphereTexture(this.gpuScene.spheres, this.renderer.capabilities.maxTextureSize);
    this.packedSphereBvh = packSphereBvh(this.gpuScene.sphereBvh, this.renderer.capabilities.maxTextureSize);
    this.packedTriangles = packTriangleTexture(this.gpuScene.triangles, this.renderer.capabilities.maxTextureSize);
    this.packedTriangleBvh = packTriangleBvh(this.gpuScene.triangleBvh, this.renderer.capabilities.maxTextureSize);
    this.packedMaterials = packMaterialTexture(this.gpuScene.materials, this.renderer.capabilities.maxTextureSize);
    this.packedTextures = packTextureTexture(this.gpuScene.textures, this.renderer.capabilities.maxTextureSize);
    this.setupControls();
    this.setupCamera();
    this.uniforms = this.createUniforms();
    this.setupShaderCanvas();
    this.watchImageTextures(this.gpuScene);
    this.watchEnvironmentTexture();
    this.watchStaticAssets();

    // Setup Post Processing / Composer Passes
    const renderTarget = new THREE.WebGLRenderTarget(
      0,
      0, // will be set by composer.setSize later
      {
        samples: window.devicePixelRatio === 1 ? 2 : 0,
      }
    );
    this.composer = new EffectComposer(this.renderer, renderTarget);
    this.hybridScene.add(
      new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.hybridMaterial)
    );
    this.resizeHybridTarget(
      window.innerWidth,
      window.innerHeight,
      Math.min(window.devicePixelRatio, 2)
    );
    this.initializeComposerPasses();

    this.setupGizmo();
    this.debugOverlayScene.add(this.ptScene.annotationGroup);
    this.setupTriangleWireframes();
    this.setupBvhHelpers();
    this.setupCameraDebugView();

    // Set Render Loop

    this.clock = new THREE.Clock();
    this.renderer.setAnimationLoop(this.renderLoop);

    // Event listeners
    this.attachEventListeners();
  }

  public captureCurrentRender(includeOverlays = false, includePanels = false, includeInteractionHandles = true) {
    return new Promise<{ blob: Blob; width: number; height: number; accumulatedFrames: number }>((resolve, reject) => {
      this.pendingCaptureRequests.push({ includeOverlays, includePanels, includeInteractionHandles, resolve, reject });
    });
  }

  public getAccumulatedFrames() {
    return this.shaderCanvas.accumulatedFrames;
  }

  public setRenderingPaused(paused: boolean) {
    this.renderingPaused = paused;
  }

  public setFixedOutputSize(width: number, height: number) {
    width = Math.max(1, Math.round(width));
    height = Math.max(1, Math.round(height));
    this.viewportWidth = width;
    this.viewportHeight = height;
    this.viewportPixelRatio = 1;
    this.updateCameraAspect(width / height);
    this.camera.updateProjectionMatrix();
    this.shaderCanvas.setDimensions(width, height);
    this.resizeHybridTarget(width, height, 1);
    this.composer.setPixelRatio(1);
    this.composer.setSize(width, height);
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(width, height, false);
    this.updateCameraProjectionUniforms();
    this.invalidate(PtInvalidationLevel.Camera, "fixed output size changed");
  }

  private snapshotPendingCaptures() {
    if (this.pendingCaptureRequests.length === 0) return;
    const request = this.pendingCaptureRequests.shift()!;
    const snapshot = document.createElement("canvas");
    snapshot.width = this.canvas.width;
    snapshot.height = this.canvas.height;
    const context = snapshot.getContext("2d");
    if (!context) {
      const error = new Error("Unable to create a capture canvas.");
      request.reject(error);
      return;
    }
    context.drawImage(this.canvas, 0, 0);
    if (request.includeOverlays && !request.includePanels) {
      this.drawCaptureGuides(context, snapshot.width, snapshot.height, request.includeInteractionHandles);
    }
    snapshot.toBlob((blob) => {
      if (!blob) {
        const error = new Error("The browser could not encode this render as PNG.");
        request.reject(error);
        return;
      }
      request.resolve({
        blob,
        width: snapshot.width,
        height: snapshot.height,
        accumulatedFrames: this.shaderCanvas.accumulatedFrames,
      });
    }, "image/png");
  }

  private drawCaptureGuides(
    context: CanvasRenderingContext2D,
    width: number,
    height: number,
    includeInteractionHandles: boolean
  ) {
    const scale = width / Math.max(1, this.canvas.clientWidth);
    const lime = "#d9f99d";
    const dark = "rgba(24, 24, 27, 0.88)";
    context.save();
    if (
      this.settings.renderMode === "comparison" ||
      this.settings.renderMode === "selectedObjectComparison"
    ) {
      const x = this.hybridSeam * width;
      context.strokeStyle = lime;
      context.lineWidth = Math.max(2, 2 * scale);
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, height);
      context.stroke();

      if (includeInteractionHandles) {
        const radius = 11 * scale;
        context.fillStyle = "#bef264";
        context.strokeStyle = "rgba(255, 255, 255, 0.8)";
        context.lineWidth = 2 * scale;
        context.beginPath();
        context.arc(x, height / 2, radius, 0, Math.PI * 2);
        context.fill();
        context.stroke();
        context.fillStyle = "#18181b";
        context.font = `700 ${12 * scale}px Inter, sans-serif`;
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillText("↔", x, height / 2);
      }

      const drawLabel = (text: string, anchorX: number, align: CanvasTextAlign) => {
        context.font = `650 ${10 * scale}px Inter, sans-serif`;
        const padding = 7 * scale;
        const labelWidth = context.measureText(text).width + padding * 2;
        const labelHeight = 20 * scale;
        const left = align === "right" ? anchorX - labelWidth : anchorX;
        const top = height - 36 * scale;
        context.fillStyle = dark;
        context.fillRect(left, top, labelWidth, labelHeight);
        context.fillStyle = "#f4f4f5";
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillText(text, left + labelWidth / 2, top + labelHeight / 2);
      };
      drawLabel("Raster", x - 9 * scale, "right");
      drawLabel("Path traced", x + 9 * scale, "left");
    } else if (this.settings.renderMode === "region") {
      const left = this.hybridRegion.x * width;
      const top = (1 - this.hybridRegion.w) * height;
      const regionWidth = (this.hybridRegion.z - this.hybridRegion.x) * width;
      const regionHeight = (this.hybridRegion.w - this.hybridRegion.y) * height;
      context.strokeStyle = "#bef264";
      context.lineWidth = 3 * scale;
      context.strokeRect(left, top, regionWidth, regionHeight);
      context.fillStyle = "#bef264";
      context.fillRect(left + 8 * scale, top + 8 * scale, 92 * scale, 20 * scale);
      context.fillStyle = "#18181b";
      context.font = `700 ${10 * scale}px Inter, sans-serif`;
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(
        `Path traced · ${Math.round((regionWidth * regionHeight * 100) / (width * height))}%`,
        left + 54 * scale,
        top + 18 * scale
      );
    }
    context.restore();
  }

  setupRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
    });
    if (!this.renderer.capabilities.isWebGL2) {
      throw new Error("The packed scene-data path requires WebGL2");
    }
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    configureRasterRenderer(this.renderer);
    this.renderer.autoClear = false;
  }

  setScene(ptScene: PtScene, invalidate = true) {
    this.cameraDebugUserControlled = false;
    this.gpuScene.dispose();
    this.packedSpheres.texture.dispose();
    this.disposePackedSphereBvh();
    this.packedTriangles.texture.dispose();
    this.disposePackedTriangleBvh();
    this.packedMaterials.texture.dispose();
    this.packedTextures.texture.dispose();
    this.debugOverlayScene.remove(this.ptScene.annotationGroup);
    this.ptScene = ptScene;
    this.debugOverlayScene.add(this.ptScene.annotationGroup);
    this.applySceneEnvironmentSettings();
    this.gpuScene = this.sceneCompiler.compile(ptScene);
    this.packedSpheres = packSphereTexture(this.gpuScene.spheres, this.renderer.capabilities.maxTextureSize);
    this.packedSphereBvh = packSphereBvh(this.gpuScene.sphereBvh, this.renderer.capabilities.maxTextureSize);
    this.packedTriangles = packTriangleTexture(this.gpuScene.triangles, this.renderer.capabilities.maxTextureSize);
    this.packedTriangleBvh = packTriangleBvh(this.gpuScene.triangleBvh, this.renderer.capabilities.maxTextureSize);
    this.packedMaterials = packMaterialTexture(this.gpuScene.materials, this.renderer.capabilities.maxTextureSize);
    this.packedTextures = packTextureTexture(this.gpuScene.textures, this.renderer.capabilities.maxTextureSize);
    this.watchImageTextures(this.gpuScene);
    this.watchEnvironmentTexture();
    this.watchStaticAssets();
    this.camera = ptScene.camera;
    this.renderer.shadowMap.needsUpdate = true;
    this.reset();
    if (invalidate) {
      this.invalidate(PtInvalidationLevel.Scene, "scene preset replaced");
    }
  }

  public setRenderMode(mode: PtSettings["renderMode"]) {
    const objectMasked =
      mode === "selectedObject" || mode === "selectedObjectComparison";
    this.settings.renderMode = mode;
    this.hybridMaterial.uniforms.uRegionMode.value = mode === "region";
    this.hybridMaterial.uniforms.uObjectMode.value = mode === "selectedObject";
    this.hybridMaterial.uniforms.uObjectComparisonMode.value =
      mode === "selectedObjectComparison";
    this.uniforms.uObjectMaskEnabled.value = objectMasked;
    this.shaderCanvas.setStencilMaskEnabled(objectMasked);
    this.updateComposerMode();
    this.cameraDebugDirty = true;
    this.invalidate(PtInvalidationLevel.Settings, "render mode changed");
  }

  public setSelectedObjectIds(objectIds: string[]) {
    const next = new Set(objectIds.slice(0, 32));
    if (
      next.size === this.selectedObjectIds.size &&
      [...next].every((objectId) => this.selectedObjectIds.has(objectId))
    ) return;
    this.selectedObjectIds.clear();
    for (const objectId of next) this.selectedObjectIds.add(objectId);
    const colors = this.hybridMaterial.uniforms.uSelectedObjectIdColors.value as THREE.Vector3[];
    let index = 0;
    for (const objectId of this.selectedObjectIds) {
      colors[index++].copy(this.objectIdColor(objectId));
    }
    this.hybridMaterial.uniforms.uSelectedObjectIdCount.value = index;
    this.hybridMaterial.uniforms.uObjectSelectionActive.value = index > 0;
    this.uniforms.uObjectMaskHasSelection.value = index > 0;
    const outlinedObjects: THREE.Object3D[] = [];
    this.ptScene.scene.traverse((object) => {
      const objectId = object.userData.pathTracer?.objectId as string | undefined;
      if (objectId && this.selectedObjectIds.has(objectId)) outlinedObjects.push(object);
    });
    this.outlinePass.selectedObjects = outlinedObjects;
    this.cameraDebugDirty = true;
    if (
      this.settings.renderMode === "selectedObject" ||
      this.settings.renderMode === "selectedObjectComparison"
    ) {
      this.shaderCanvas.resetAccumulation();
    }
  }

  public setRegionTracingMode(mode: PtSettings["regionTracingMode"]) {
    if (this.settings.regionTracingMode === mode) return;
    this.settings.regionTracingMode = mode;
    this.cameraDebugDirty = true;
    this.shaderCanvas.resetAccumulation();
  }

  public setComparisonTracingMode(mode: PtSettings["comparisonTracingMode"]) {
    if (this.settings.comparisonTracingMode === mode) return;
    this.settings.comparisonTracingMode = mode;
    this.cameraDebugDirty = true;
    this.shaderCanvas.resetAccumulation();
  }

  public setHybridComparisonSeam(seam: number) {
    const next = THREE.MathUtils.clamp(seam, 0, 1);
    const changed = next !== this.hybridSeam;
    this.hybridSeam = next;
    this.hybridMaterial.uniforms.uSeam.value = next;
    // Rebuilding the camera-ray diagram traces representative rays and
    // reconstructs its helper geometry. Defer that work while the seam is
    // being manipulated so pointer movement stays responsive.
    if (changed && !this.hybridRegionInteractionActive) this.cameraDebugDirty = true;
    if (
      changed &&
      (this.settings.renderMode === "comparison" ||
        this.settings.renderMode === "selectedObjectComparison") &&
      this.settings.comparisonTracingMode === "pathtracedSide"
    ) {
      this.shaderCanvas.resetAccumulation();
    }
  }

  public getHybridComparisonSeam() {
    return this.hybridSeam;
  }

  public getHybridRegion(): [number, number, number, number] {
    return [
      this.hybridRegion.x,
      1 - this.hybridRegion.w,
      this.hybridRegion.z - this.hybridRegion.x,
      this.hybridRegion.w - this.hybridRegion.y,
    ];
  }

  public setHybridRegion(left: number, top: number, width: number, height: number) {
    const minX = THREE.MathUtils.clamp(left, 0, 1);
    const maxX = THREE.MathUtils.clamp(left + width, minX, 1);
    const maxY = 1 - THREE.MathUtils.clamp(top, 0, 1);
    const minY = 1 - THREE.MathUtils.clamp(top + height, 0, 1);
    const changed =
      minX !== this.hybridRegion.x || minY !== this.hybridRegion.y ||
      maxX !== this.hybridRegion.z || maxY !== this.hybridRegion.w;
    this.hybridRegion.set(minX, minY, maxX, maxY);
    this.hybridMaterial.uniforms.uRegion.value.copy(this.hybridRegion);
    if (changed) this.cameraDebugDirty = true;
    if (
      changed &&
      this.settings.renderMode === "region" &&
      this.settings.regionTracingMode === "roiOnly"
    ) {
      this.shaderCanvas.resetAccumulation();
    }
  }

  public setHybridRegionInteractionActive(active: boolean) {
    this.setHybridInteractionActive(active);
  }

  public setHybridInteractionActive(active: boolean) {
    const interactionEnded = this.hybridRegionInteractionActive && !active;
    this.hybridRegionInteractionActive = active;
    if (interactionEnded) this.cameraDebugDirty = true;
  }

  public setFov(fov: number, invalidate = true) {
    this.settings.fov = fov;
    if (this.camera instanceof THREE.PerspectiveCamera) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
    this.updateCameraProjectionUniforms();
    if (invalidate) {
      this.invalidate(PtInvalidationLevel.Camera, "camera field of view changed");
    }
  }

  public setOrthographicHeight(height: number, invalidate = true) {
    this.settings.orthographicHeight = Math.max(0.05, height);
    if (this.camera instanceof THREE.OrthographicCamera) {
      this.updateCameraAspect(this.canvas.clientWidth / Math.max(1, this.canvas.clientHeight));
      this.camera.updateProjectionMatrix();
    }
    this.updateCameraProjectionUniforms();
    if (invalidate) {
      this.invalidate(PtInvalidationLevel.Camera, "orthographic view height changed");
    }
  }

  public setCameraProjectionMode(
    mode: PtSettings["cameraProjectionMode"],
    invalidate = true
  ) {
    if (
      this.settings.cameraProjectionMode === mode &&
      ((mode === "perspective" && this.camera instanceof THREE.PerspectiveCamera) ||
        (mode === "orthographic" && this.camera instanceof THREE.OrthographicCamera))
    ) return;
    const previous = this.camera;
    const aspect = this.viewportWidth > 0
      ? this.viewportWidth / Math.max(1, this.viewportHeight)
      : this.canvas.clientWidth / Math.max(1, this.canvas.clientHeight);
    const next = mode === "orthographic"
      ? new THREE.OrthographicCamera(-1, 1, 1, -1, previous.near, previous.far)
      : new THREE.PerspectiveCamera(this.settings.fov, aspect, previous.near, previous.far);
    next.position.copy(previous.position);
    next.quaternion.copy(previous.quaternion);
    next.up.copy(previous.up);
    next.updateMatrixWorld(true);
    this.camera = next;
    this.uniforms.uCamera.value.position = this.camera.position;
    this.settings.cameraProjectionMode = mode;
    if (mode === "orthographic") {
      this.settings.enableDepthOfField = false;
      this.uniforms.uEnableDoF.value = false;
    }
    this.updateCameraAspect(aspect);
    this.camera.updateProjectionMatrix();
    this.orbitControls.object = this.camera;
    this.transformControls.camera = this.camera;
    this.renderPass.camera = this.camera;
    this.outlinePass.renderCamera = this.camera;
    this.updateCameraProjectionUniforms();
    if (invalidate) {
      this.invalidate(PtInvalidationLevel.Camera, `camera projection changed to ${mode}`);
    }
  }

  public setNumSamples(samples: number, invalidate = true) {
    this.settings.numSamples = samples;
    this.uniforms.uNumSamples.value = samples;
    if (invalidate) {
      this.invalidate(PtInvalidationLevel.Settings, "samples per frame changed");
    }
  }

  public subscribeFrameTiming(listener: (frameTimeMs: number) => void) {
    this.frameTimingListeners.add(listener);
    return () => this.frameTimingListeners.delete(listener);
  }

  public getAdaptiveQualityContext() {
    const gl = this.renderer.getContext();
    const debugInfo = gl.getExtension("WEBGL_debug_renderer_info") as { UNMASKED_RENDERER_WEBGL: number } | null;
    const renderer = debugInfo
      ? String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL))
      : String(gl.getParameter(gl.RENDERER));
    return {
      viewportWidth: Math.max(1, this.canvas.clientWidth),
      viewportHeight: Math.max(1, this.canvas.clientHeight),
      devicePixelRatio: window.devicePixelRatio || 1,
      renderer,
    };
  }

  public invalidateAdaptiveQualityFrame() {
    // Benchmark frames need fresh path-tracing work, but no camera or scene
    // state changed. The general invalidation path also rebuilds the Camera
    // rays diagram, which would measure debug-helper construction rather than
    // the candidate render settings.
    this.shaderCanvas.resetAccumulation();
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

  public setTriangleTraversalMode(mode: PtSettings["triangleTraversalMode"]) {
    this.settings.triangleTraversalMode = mode;
    this.uniforms.uTriangleTraversalMode.value = mode === "bvh" ? 1 : 0;
    this.invalidate(PtInvalidationLevel.Settings, "triangle traversal mode changed");
  }

  public setTriangleOverlayMode(mode: PtSettings["triangleOverlayMode"]) {
    this.settings.triangleOverlayMode = mode;
    this.updateTriangleWireframeVisibility();
  }

  public setSelectedTriangleMesh(objectId: string | null) {
    this.selectedTriangleMeshId = objectId;
    this.updateTriangleWireframeVisibility();
  }

  public setTriangleWireframeVisible(objectId: string, visible: boolean) {
    this.triangleWireframeOverrides.set(objectId, visible);
    this.updateTriangleWireframeVisibility();
  }

  public isTriangleWireframeVisible(objectId: string) {
    const override = this.triangleWireframeOverrides.get(objectId);
    if (override !== undefined) return override;
    return this.settings.triangleOverlayMode === "all" ||
      (this.settings.triangleOverlayMode === "selected" && objectId === this.selectedTriangleMeshId);
  }

  public setBvhOverlayEnabled(enabled: boolean) {
    this.settings.bvhOverlayEnabled = enabled;
    this.rebuildBvhHelpers();
    this.updateBvhHelperVisibility();
  }

  public setBvhOverlayDepth(depth: number) {
    this.settings.bvhOverlayDepth = depth;
    this.rebuildBvhHelpers();
    this.updateBvhHelperVisibility();
  }

  public setDepthOfFieldEnabled(enabled: boolean, invalidate = true) {
    const effectiveEnabled = enabled && this.settings.cameraProjectionMode !== "orthographic";
    this.settings.enableDepthOfField = effectiveEnabled;
    this.uniforms.uEnableDoF.value = effectiveEnabled;
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
    if (this.camera instanceof THREE.OrthographicCamera) {
      this.setOrthographicHeight(Math.max(0.05, radius * 2.5), false);
    }
    this.orbitControls.target.copy(center);
    this.camera.position
      .copy(center)
      .addScaledVector(viewDirection, distance);
    this.orbitControls.update();
    this.invalidate(PtInvalidationLevel.Camera, "selected object framed");
  }

  public invalidate(level: PtInvalidationLevel, reason: string) {
    this.cameraDebugDirty = true;
    if (level >= PtInvalidationLevel.Geometry && this.bvhTraversalState) {
      this.setBvhTraversalVisualization(null);
      this.bvhTraversalInvalidated?.();
    }
    if (level >= PtInvalidationLevel.Material) {
      this.sceneCompiler.update(this.gpuScene, this.ptScene, level);
      if (level >= PtInvalidationLevel.Geometry) this.updatePackedGeometryTextures();
      this.updatePackedMaterialTextures();
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

  public setCameraDebugViewEnabled(enabled: boolean) {
    this.cameraDebugEnabled = enabled;
  }

  public setCameraDebugViewport(
    viewport: { left: number; top: number; width: number; height: number } | null
  ) {
    this.cameraDebugViewport = viewport;
  }

  public setCameraDebugRayGrid(columns: number, rows: number) {
    this.cameraDebugRayGrid = {
      columns: Math.max(1, Math.round(columns)),
      rows: Math.max(1, Math.round(rows)),
    };
    this.cameraDebugDirty = true;
  }

  public setCameraDebugMaxDepth(depth: number) {
    this.cameraDebugMaxDepth = THREE.MathUtils.clamp(Math.round(depth), 1, 3);
    this.cameraDebugDirty = true;
  }

  private debugRandom(seed: number) {
    const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
    return value - Math.floor(value);
  }

  private scatterCameraDebugRay(
    incident: THREE.Vector3,
    hit: THREE.Intersection,
    seed: number
  ) {
    const object = hit.object as THREE.Mesh;
    const outwardNormal = (hit.face?.normal.clone() ?? new THREE.Vector3(0, 1, 0))
      .transformDirection(object.matrixWorld);
    const entering = outwardNormal.dot(incident) < 0;
    const normal = entering ? outwardNormal : outwardNormal.clone().negate();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    const material = materials[hit.face?.materialIndex ?? 0] as THREE.MeshStandardMaterial | undefined;
    const metallic = material && "metalness" in material ? material.metalness : 0;
    const roughness = material && "roughness" in material ? material.roughness : 1;
    const transmission = material && "transmission" in material
      ? Number((material as THREE.MeshPhysicalMaterial).transmission)
      : 0;
    if (
      material &&
      "emissive" in material &&
      material.emissive.getHex() !== 0 &&
      material.emissiveIntensity > 0
    ) return null;

    const reflected = incident.clone().reflect(normal).normalize();
    if (transmission > 0.05) {
      const ior = Math.max(1.0001, Number((material as THREE.MeshPhysicalMaterial).ior) || 1.5);
      const eta = entering ? 1 / ior : ior;
      const cosTheta = Math.min(1, -incident.dot(normal));
      const sinThetaSquared = Math.max(0, 1 - cosTheta * cosTheta);
      const cannotRefract = eta * eta * sinThetaSquared > 1;
      const r0 = ((1 - ior) / (1 + ior)) ** 2;
      const reflectance = r0 + (1 - r0) * ((1 - cosTheta) ** 5);
      if (cannotRefract || this.debugRandom(seed) < reflectance) return reflected;
      const perpendicular = incident.clone().addScaledVector(normal, cosTheta).multiplyScalar(eta);
      const parallel = normal.clone().multiplyScalar(
        -Math.sqrt(Math.max(0, 1 - perpendicular.lengthSq()))
      );
      return perpendicular.add(parallel).normalize();
    }

    const u1 = this.debugRandom(seed + 1);
    const u2 = this.debugRandom(seed + 2);
    const radius = Math.sqrt(u1);
    const angle = Math.PI * 2 * u2;
    const tangent = Math.abs(normal.y) < 0.999
      ? new THREE.Vector3(0, 1, 0).cross(normal).normalize()
      : new THREE.Vector3(1, 0, 0);
    const bitangent = new THREE.Vector3().crossVectors(normal, tangent).normalize();
    const diffuse = normal.clone().multiplyScalar(Math.sqrt(1 - u1))
      .addScaledVector(tangent, radius * Math.cos(angle))
      .addScaledVector(bitangent, radius * Math.sin(angle))
      .normalize();
    return metallic > 0.5
      ? reflected.lerp(diffuse, THREE.MathUtils.clamp(roughness * roughness, 0, 1)).normalize()
      : diffuse;
  }

  public attachCameraDebugControls(element: HTMLElement | null) {
    this.cameraDebugControls?.dispose();
    this.cameraDebugControls = null;
    this.cameraDebugInteractionActive = false;
    if (!element) return;
    const controls = new OrbitControls(this.cameraDebugCamera, element);
    controls.enableDamping = false;
    controls.screenSpacePanning = true;
    controls.addEventListener("start", () => {
      this.cameraDebugUserControlled = true;
      this.cameraDebugInteractionActive = true;
    });
    controls.addEventListener("end", () => {
      this.cameraDebugInteractionActive = false;
    });
    this.cameraDebugControls = controls;
  }

  public resetCameraDebugView() {
    this.cameraDebugUserControlled = false;
    this.cameraDebugDirty = true;
  }

  public setCameraDebugBvhDepth(depth: number) {
    const next = Math.max(0, Math.round(depth));
    if (this.cameraDebugBvhDepth === next) return;
    this.cameraDebugBvhDepth = next;
    this.cameraDebugDirty = true;
  }

  public setCameraDebugBvhEnabled(enabled: boolean) {
    if (this.cameraDebugBvhEnabled === enabled) return;
    this.cameraDebugBvhEnabled = enabled;
    this.cameraDebugDirty = true;
  }

  private setupCameraDebugView() {
    this.cameraDebugScene.background = new THREE.Color(0x11151b);
    this.cameraDebugScene.add(new THREE.HemisphereLight(0xdbeafe, 0x273244, 2.2));
    const key = new THREE.DirectionalLight(0xffffff, 2.5);
    key.position.set(4, 7, 5);
    this.cameraDebugScene.add(key);
    this.cameraDebugScene.add(this.cameraDebugGroup);
  }

  private rebuildCameraDebugView() {
    this.cameraDebugGroup.traverse((object) => {
      const mesh = object as THREE.Mesh;
      mesh.geometry?.dispose?.();
      const material = mesh.material;
      if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
      else material?.dispose?.();
    });
    this.cameraDebugScene.remove(this.cameraDebugGroup);
    this.cameraDebugGroup = new THREE.Group();
    this.cameraDebugScene.add(this.cameraDebugGroup);

    this.camera.updateMatrixWorld(true);
    const traceableMeshes = [
      ...this.ptScene.getSphereMeshes(),
      ...this.ptScene.getQuadMeshes(),
      ...this.ptScene.getBoxMeshes(),
      ...this.ptScene.getTriangleMeshes(),
    ];
    for (const mesh of traceableMeshes.slice(0, 48)) {
      if (!mesh.visible) continue;
      mesh.updateWorldMatrix(true, false);
      const primitiveType = mesh.userData.pathTracer.primitiveType;
      const color = primitiveType === "sphere"
        ? 0xc084fc
        : primitiveType === "quad"
          ? 0x38bdf8
          : primitiveType === "box"
            ? 0xf59e0b
          : 0x94a3b8;
      let outlineGeometry: THREE.BufferGeometry;
      if (primitiveType === "sphere") {
        const proxy = new THREE.SphereGeometry(1, 14, 9);
        outlineGeometry = new THREE.WireframeGeometry(proxy);
        proxy.dispose();
      } else {
        outlineGeometry = new THREE.EdgesGeometry(
          mesh.geometry,
          primitiveType === "triangleMesh" ? 1 : 24
        );
      }
      const outline = new THREE.LineSegments(
        outlineGeometry,
        new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.46 })
      );
      outline.matrixAutoUpdate = false;
      outline.matrix.copy(mesh.matrixWorld);
      this.cameraDebugGroup.add(outline);
    }

    const diagramCamera = this.camera.clone();
    diagramCamera.near = Math.max(0.01, this.camera.near);
    const cameraViewDistance = Math.max(
      1,
      diagramCamera.position.distanceTo(this.orbitControls.target)
    );
    const diagramRange = cameraViewDistance * 3;
    // The educational frustum should end just beyond the scene. Copying the
    // production camera's very distant far plane makes the useful diagram a
    // nearly invisible speck.
    diagramCamera.far = Math.max(diagramCamera.near * 10, diagramRange);
    diagramCamera.updateProjectionMatrix();
    diagramCamera.updateMatrixWorld(true);
    if (diagramCamera instanceof THREE.PerspectiveCamera) {
      const cameraMarker = new THREE.Mesh(
        new THREE.SphereGeometry(Math.max(0.035, cameraViewDistance * 0.025), 12, 8),
        new THREE.MeshBasicMaterial({ color: 0x60a5fa, depthTest: false })
      );
      cameraMarker.position.copy(diagramCamera.position);
      cameraMarker.renderOrder = 4;
      this.cameraDebugGroup.add(cameraMarker);
    }

    const forward = new THREE.Vector3();
    diagramCamera.getWorldDirection(forward);
    // Perspective rays originate at the camera and pass through an illustrative
    // image plane in front of it. Orthographic rays instead originate across
    // the camera's near plane, so draw the viewport at that exact plane. Using
    // the perspective diagram distance for both projections made orthographic
    // rays look detached from the viewport even though their directions were
    // otherwise correct.
    const planeDistance = diagramCamera instanceof THREE.OrthographicCamera
      ? diagramCamera.near
      : Math.max(cameraViewDistance * 0.12, diagramCamera.near * 4);
    const diagramAspect = this.canvas.clientWidth / Math.max(1, this.canvas.clientHeight);
    const planeHeight = diagramCamera instanceof THREE.OrthographicCamera
      ? this.settings.orthographicHeight
      : 2 * Math.tan(THREE.MathUtils.degToRad(diagramCamera.fov * 0.5)) * planeDistance;
    const planeWidth = planeHeight * diagramAspect;
    const imagePlane = new THREE.Mesh(
      new THREE.PlaneGeometry(planeWidth, planeHeight),
      new THREE.MeshBasicMaterial({
        map: this.shaderCanvas.outputTexture,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.78,
      })
    );
    imagePlane.position.copy(diagramCamera.position).addScaledVector(forward, planeDistance);
    imagePlane.quaternion.copy(diagramCamera.quaternion);
    this.cameraDebugGroup.add(imagePlane);

    const viewportLines: THREE.Vector3[] = [];
    const gridColumns = 8;
    const gridRows = 6;
    for (let column = 0; column <= gridColumns; column += 1) {
      const x = THREE.MathUtils.lerp(-planeWidth / 2, planeWidth / 2, column / gridColumns);
      viewportLines.push(
        new THREE.Vector3(x, -planeHeight / 2, 0),
        new THREE.Vector3(x, planeHeight / 2, 0)
      );
    }
    for (let row = 0; row <= gridRows; row += 1) {
      const y = THREE.MathUtils.lerp(-planeHeight / 2, planeHeight / 2, row / gridRows);
      viewportLines.push(
        new THREE.Vector3(-planeWidth / 2, y, 0),
        new THREE.Vector3(planeWidth / 2, y, 0)
      );
    }
    const viewportGrid = new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints(viewportLines),
      new THREE.LineBasicMaterial({
        color: 0xe2e8f0,
        transparent: true,
        opacity: 0.75,
        depthTest: false,
      })
    );
    viewportGrid.position.copy(imagePlane.position);
    viewportGrid.quaternion.copy(imagePlane.quaternion);
    viewportGrid.translateZ(0.001);
    viewportGrid.renderOrder = 2;
    this.cameraDebugGroup.add(viewportGrid);

    const raycaster = new THREE.Raycaster();
    raycaster.far = diagramRange;
    const rayPositions: number[] = [];
    const colors: number[] = [];
    const rayTargets = this.ptScene.scene.children.filter((object) => object.visible);
    const traceableObjectIds = new Map<THREE.Object3D, string>();
    for (const mesh of traceableMeshes) {
      const objectId = mesh.userData.pathTracer?.objectId as string | undefined;
      if (objectId) traceableObjectIds.set(mesh, objectId);
    }
    const selectedPrimaryHit = (hit: THREE.Intersection | undefined) => {
      let object: THREE.Object3D | null = hit?.object ?? null;
      while (object) {
        const objectId = traceableObjectIds.get(object);
        if (objectId) return this.selectedObjectIds.has(objectId);
        object = object.parent;
      }
      return false;
    };
    const launchesPrimaryRay = (
      u: number,
      v: number,
      primaryHit: THREE.Intersection | undefined
    ) => {
      switch (this.settings.renderMode) {
        case "raster":
          return false;
        case "comparison":
          return this.settings.comparisonTracingMode === "fullFrame" || u >= this.hybridSeam;
        case "region":
          return this.settings.regionTracingMode === "fullFrame" || (
            u >= this.hybridRegion.x && u <= this.hybridRegion.z &&
            v >= this.hybridRegion.y && v <= this.hybridRegion.w
          );
        case "selectedObject":
          return selectedPrimaryHit(primaryHit);
        case "selectedObjectComparison":
          return selectedPrimaryHit(primaryHit) && (
            this.settings.comparisonTracingMode === "fullFrame" || u >= this.hybridSeam
          );
        case "pathtraced":
        default:
          return true;
      }
    };
    const { columns, rows } = this.cameraDebugRayGrid;
    let primaryRayIndex = 0;
    for (let row = 0; row < rows; row += 1) {
      const y = rows === 1 ? 0 : THREE.MathUtils.lerp(-0.72, 0.72, row / (rows - 1));
      for (let column = 0; column < columns; column += 1) {
        const x = columns === 1 ? 0 : THREE.MathUtils.lerp(-0.8, 0.8, column / (columns - 1));
        raycaster.setFromCamera(new THREE.Vector2(x, y), diagramCamera);
        let origin = raycaster.ray.origin.clone();
        let direction = raycaster.ray.direction.clone();
        raycaster.far = diagramRange;
        const primaryHit = raycaster.intersectObjects(rayTargets, true)[0];
        const u = (x + 1) * 0.5;
        const v = (y + 1) * 0.5;
        const sampleIndex = primaryRayIndex;
        primaryRayIndex += 1;
        if (!launchesPrimaryRay(u, v, primaryHit)) continue;
        for (let depth = 0; depth < this.cameraDebugMaxDepth; depth += 1) {
          raycaster.set(origin, direction);
          raycaster.far = diagramRange;
          const hit = raycaster.intersectObjects(rayTargets, true)[0];
          const end = hit?.point ?? raycaster.ray.at(diagramRange, new THREE.Vector3());
          rayPositions.push(origin.x, origin.y, origin.z, end.x, end.y, end.z);
          const bounceColors = [0xa3e635, 0x38bdf8, 0xc084fc];
          const color = new THREE.Color(hit ? bounceColors[depth] : 0xf59e0b);
          colors.push(color.r, color.g, color.b, color.r, color.g, color.b);
          if (!hit) break;
          const scattered = this.scatterCameraDebugRay(
            direction,
            hit,
            sampleIndex * 11 + depth * 101
          );
          if (!scattered) break;
          direction = scattered;
          origin = end.clone().addScaledVector(direction, 0.001);
        }
      }
    }
    const rayGeometry = new THREE.BufferGeometry();
    rayGeometry.setAttribute("position", new THREE.Float32BufferAttribute(rayPositions, 3));
    rayGeometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    this.cameraDebugGroup.add(new THREE.LineSegments(
      rayGeometry,
      new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.95,
        depthTest: false,
      })
    ));

    const debugBvhBatches = new Map<string, { positions: number[]; color: number; opacity: number }>();
    if (this.cameraDebugBvhEnabled) {
      for (const node of this.bvhOverlayNodes) {
        if (node.depth > this.cameraDebugBvhDepth) continue;
        const color = node.kind === "sphere"
          ? (node.leaf ? 0xfbbf24 : 0xc084fc)
          : (node.leaf ? 0x4ade80 : 0x38bdf8);
        const opacity = node.depth === this.cameraDebugBvhDepth ? 0.68 : 0.3;
        const key = `${color}:${opacity}`;
        let batch = debugBvhBatches.get(key);
        if (!batch) {
          batch = { positions: [], color, opacity };
          debugBvhBatches.set(key, batch);
        }
        batch.positions.push(...this.boxEdgePositions(node.boundsMin, node.boundsMax));
      }
    }
    for (const batch of debugBvhBatches.values()) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(batch.positions, 3));
      const lines = new THREE.LineSegments(
        geometry,
        new THREE.LineBasicMaterial({
          color: batch.color,
          transparent: true,
          opacity: batch.opacity,
          depthTest: false,
          depthWrite: false,
        })
      );
      lines.frustumCulled = false;
      this.cameraDebugGroup.add(lines);
    }

    // Keep the observer camera in a stable camera-relative pose. Deriving its
    // framing from hit endpoints causes visible jumps whenever a sample ray
    // crosses a silhouette and changes discontinuously between hit and miss.
    const cameraRight = new THREE.Vector3(1, 0, 0).applyQuaternion(diagramCamera.quaternion);
    const cameraUp = new THREE.Vector3(0, 1, 0).applyQuaternion(diagramCamera.quaternion);
    const overviewCenter = diagramCamera.position.clone().addScaledVector(forward, diagramRange * 0.42);
    if (!this.cameraDebugUserControlled) {
      this.cameraDebugCamera.position
        .copy(diagramCamera.position)
        .addScaledVector(cameraRight, diagramRange * 0.72)
        .addScaledVector(cameraUp, diagramRange * 0.44)
        .addScaledVector(forward, -diagramRange * 0.08);
      this.cameraDebugCamera.lookAt(overviewCenter);
      this.cameraDebugControls?.target.copy(overviewCenter);
      this.cameraDebugControls?.update();
    }
    this.cameraDebugCamera.near = Math.max(0.01, diagramRange / 100);
    this.cameraDebugCamera.far = diagramRange * 4;
    this.cameraDebugCamera.updateProjectionMatrix();
    this.cameraDebugDirty = false;
  }

  private renderCameraDebugView() {
    const viewport = this.cameraDebugViewport;
    if (!this.cameraDebugEnabled || !viewport || viewport.width < 2 || viewport.height < 2) return;
    if (this.cameraDebugDirty) this.rebuildCameraDebugView();

    const canvasHeight = this.canvas.clientHeight;
    // WebGLRenderer's viewport/scissor API accepts logical CSS pixels and
    // applies its pixel ratio internally for the default framebuffer.
    const left = Math.round(viewport.left);
    const bottom = Math.round(canvasHeight - viewport.top - viewport.height);
    const width = Math.round(viewport.width);
    const height = Math.round(viewport.height);
    this.cameraDebugCamera.aspect = width / height;
    this.cameraDebugCamera.updateProjectionMatrix();

    this.renderer.setScissorTest(true);
    this.renderer.setViewport(left, bottom, width, height);
    this.renderer.setScissor(left, bottom, width, height);
    this.renderer.clear(true, true, false);
    this.renderer.render(this.cameraDebugScene, this.cameraDebugCamera);
    this.renderer.setScissorTest(false);
    const fullSize = this.renderer.getSize(new THREE.Vector2());
    this.renderer.setViewport(0, 0, fullSize.x, fullSize.y);
    this.renderer.setScissor(0, 0, fullSize.x, fullSize.y);
  }

  public getInvalidationHistory(): readonly PtInvalidationEvent[] {
    return [...this.invalidationHistory];
  }

  public getTriangleBvhStats(): Readonly<TriangleBvhStats> {
    return { ...this.gpuScene.triangleBvh.stats };
  }

  public getSphereBvhStats() {
    return { ...this.gpuScene.sphereBvh.stats };
  }

  public getTriangleBvhProbeStats() {
    return measureTriangleBvh(this.gpuScene.triangleBvh, this.gpuScene.triangles);
  }

  public onBvhTraversalInvalidated(listener: (() => void) | null) {
    this.bvhTraversalInvalidated = listener;
  }

  public inspectBvhTraversal(ndc: THREE.Vector2): PtBvhTraversalState {
    this.camera.updateMatrixWorld();
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(ndc, this.camera);
    const ray = {
      origin: raycaster.ray.origin.clone(),
      direction: raycaster.ray.direction.clone().normalize(),
    };
    const minimumDistance = 1e-3;
    const sphereTrace = traceSphereBvhTraversal(
      this.gpuScene.sphereBvh, this.gpuScene.spheres, ray, minimumDistance
    );
    const triangleTrace = traceTriangleBvhTraversal(
      this.gpuScene.triangleBvh,
      this.gpuScene.triangles,
      ray,
      minimumDistance,
      sphereTrace.result.distance
    );
    const events: PtBvhTraversalState["events"] = [
      ...sphereTrace.events.map((event) => ({ ...event, geometryKind: "sphere" as const })),
      ...triangleTrace.events.map((event) => ({ ...event, geometryKind: "triangle" as const })),
    ];
    const triangleWon = triangleTrace.result.triangleIndex >= 0;
    const geometryKind = triangleWon
      ? "triangle" as const
      : sphereTrace.result.sphereIndex >= 0 ? "sphere" as const : null;
    const primitiveIndex = triangleWon
      ? triangleTrace.result.triangleIndex
      : sphereTrace.result.sphereIndex;
    const distance = triangleWon ? triangleTrace.result.distance : sphereTrace.result.distance;

    const bruteSphere = this.gpuScene.spheres.reduce(
      (closest, sphere, sphereIndex) => {
        const hitDistance = hitSphereDistance(sphere, ray, minimumDistance, closest.distance);
        return hitDistance === null ? closest : { geometryKind: "sphere" as const, primitiveIndex: sphereIndex, distance: hitDistance };
      },
      { geometryKind: null as "sphere" | "triangle" | null, primitiveIndex: -1, distance: Number.POSITIVE_INFINITY }
    );
    const bruteForce = this.gpuScene.triangles.reduce(
      (closest, triangle, triangleIndex) => {
        const hitDistance = hitTriangleDistance(triangle, ray, minimumDistance, closest.distance);
        return hitDistance === null ? closest : { geometryKind: "triangle" as const, primitiveIndex: triangleIndex, distance: hitDistance };
      },
      bruteSphere
    );
    const state: PtBvhTraversalState = {
      armed: false,
      step: events.length > 0 ? 0 : -1,
      rayOrigin: ray.origin.toArray(),
      rayDirection: ray.direction.toArray(),
      events,
      result: {
        geometryKind,
        primitiveIndex,
        distance: Number.isFinite(distance) ? distance : null,
        nodeTests: sphereTrace.result.nodeTests + triangleTrace.result.nodeTests,
        primitiveTests: sphereTrace.result.sphereTests + triangleTrace.result.triangleTests,
        agreesWithBruteForce:
          geometryKind === bruteForce.geometryKind && primitiveIndex === bruteForce.primitiveIndex &&
          (primitiveIndex < 0 || Math.abs(distance - bruteForce.distance) < 1e-7),
      },
    };
    this.setBvhTraversalVisualization(state);
    return state;
  }

  public setBvhTraversalVisualization(state: PtBvhTraversalState | null) {
    this.bvhTraversalState = state;
    this.bvhTraversalRay = this.disposeDebugLine(this.bvhTraversalRay);
    this.bvhTraversalTriangle = this.disposeDebugLine(this.bvhTraversalTriangle);
    this.bvhTraversalHit = this.disposeDebugLine(this.bvhTraversalHit);
    if (state?.rayOrigin && state.rayDirection) {
      const origin = new THREE.Vector3(...state.rayOrigin);
      const direction = new THREE.Vector3(...state.rayDirection);
      const roots = [this.gpuScene.sphereBvh.nodes[0], this.gpuScene.triangleBvh.nodes[0]].filter(Boolean);
      const rootBounds = roots.length > 0
        ? roots.reduce((bounds, root) => bounds.expandByPoint(root!.boundsMin).expandByPoint(root!.boundsMax), new THREE.Box3())
        : null;
      const fallbackLength = rootBounds
        ? origin.distanceTo(rootBounds.getCenter(new THREE.Vector3())) + rootBounds.getSize(new THREE.Vector3()).length()
        : 10;
      const length = state.result?.distance ?? fallbackLength;
      const end = origin.clone().addScaledVector(direction, length);
      const geometry = new LineGeometry();
      geometry.setPositions([...origin.toArray(), ...end.toArray()]);
      const material = new LineMaterial({ color: 0xf8fafc, linewidth: 3, depthTest: false, depthWrite: false });
      this.bvhTraversalRay = new Line2(geometry, material);
      this.bvhTraversalRay.computeLineDistances();
      this.debugOverlayScene.add(this.bvhTraversalRay);

      const currentEvent = state.events[state.step];
      if (currentEvent?.kind === "triangle") {
        this.bvhTraversalTriangle = this.createTriangleDebugLine(
          currentEvent.triangleIndex,
          currentEvent.closest ? 0xfacc15 : 0xfb7185
        );
      }
      if (currentEvent?.kind === "sphere") {
        this.bvhTraversalTriangle = this.createSphereDebugLine(
          currentEvent.sphereIndex,
          currentEvent.closest ? 0xfacc15 : 0xfb7185
        );
      }
      if (state.result && state.result.primitiveIndex >= 0) {
        this.bvhTraversalHit = state.result.geometryKind === "sphere"
          ? this.createSphereDebugLine(state.result.primitiveIndex, 0x4ade80, 3)
          : this.createTriangleDebugLine(state.result.primitiveIndex, 0x4ade80, 3);
      }
    }
    this.updateBvhHelperVisibility();
  }

  private createTriangleDebugLine(triangleIndex: number, color: number, linewidth = 3) {
    const triangle = this.gpuScene.triangles[triangleIndex];
    if (!triangle) return null;
    const geometry = new LineSegmentsGeometry();
    geometry.setPositions([
      ...triangle.a.toArray(), ...triangle.b.toArray(),
      ...triangle.b.toArray(), ...triangle.c.toArray(),
      ...triangle.c.toArray(), ...triangle.a.toArray(),
    ]);
    const material = new LineMaterial({ color, linewidth, depthTest: false, depthWrite: false });
    const line = new LineSegments2(geometry, material);
    line.computeLineDistances();
    this.debugOverlayScene.add(line);
    return line;
  }

  private createSphereDebugLine(sphereIndex: number, color: number, linewidth = 3) {
    const sphere = this.gpuScene.spheres[sphereIndex];
    if (!sphere) return null;
    const positions: number[] = [];
    const segments = 48;
    for (let plane = 0; plane < 3; plane += 1) {
      for (let segment = 0; segment < segments; segment += 1) {
        const start = (segment / segments) * Math.PI * 2;
        const end = ((segment + 1) / segments) * Math.PI * 2;
        const startPoint = new THREE.Vector3();
        const endPoint = new THREE.Vector3();
        if (plane === 0) {
          startPoint.set(Math.cos(start), Math.sin(start), 0);
          endPoint.set(Math.cos(end), Math.sin(end), 0);
        } else if (plane === 1) {
          startPoint.set(Math.cos(start), 0, Math.sin(start));
          endPoint.set(Math.cos(end), 0, Math.sin(end));
        } else {
          startPoint.set(0, Math.cos(start), Math.sin(start));
          endPoint.set(0, Math.cos(end), Math.sin(end));
        }
        positions.push(
          ...startPoint.multiplyScalar(sphere.radius).add(sphere.position).toArray(),
          ...endPoint.multiplyScalar(sphere.radius).add(sphere.position).toArray()
        );
      }
    }
    const geometry = new LineSegmentsGeometry();
    geometry.setPositions(positions);
    const material = new LineMaterial({ color, linewidth, depthTest: false, depthWrite: false });
    const line = new LineSegments2(geometry, material);
    line.computeLineDistances();
    this.debugOverlayScene.add(line);
    return line;
  }

  private disposeDebugLine<T extends THREE.Object3D & {
    geometry: THREE.BufferGeometry;
    material: THREE.Material | THREE.Material[];
  }>(line: T | null): null {
    if (!line) return null;
    line.geometry.dispose();
    if (Array.isArray(line.material)) line.material.forEach((material) => material.dispose());
    else line.material.dispose();
    this.debugOverlayScene.remove(line);
    return null;
  }

  private reset() {
    this.setupControls();
    this.setupCamera();
    this.updateUniforms();
    this.updateShaderCanvas();
    this.shaderCanvas.updateMaterial();

    this.updateComposerScene();

    this.setupGizmo();
    this.setupTriangleWireframes();
    this.setupBvhHelpers();
  }

  private setupShaderCanvas() {
    const quadCapacity = this.quadUniformCapacity();
    const boxCapacity = this.boxUniformCapacity();
    const lightCapacity = this.lightUniformCapacity();
    this.shaderCanvas = new ShaderCanvas({
      width: window.innerWidth,
      height: window.innerHeight,
      fragmentShader: `#define MAX_QUADS ${quadCapacity}
       #define MAX_BOXES ${boxCapacity}
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
    const quadCapacity = this.quadUniformCapacity();
    const boxCapacity = this.boxUniformCapacity();
    const lightCapacity = this.lightUniformCapacity();
    this.shaderCanvas
      .setShader(`#define MAX_QUADS ${quadCapacity}
       #define MAX_BOXES ${boxCapacity}
       #define MAX_LIGHTS ${lightCapacity}
       ${fragShader}`);
  }

  private quadUniformCapacity() {
    return Math.max(1, this.gpuScene.quads.length);
  }

  private boxUniformCapacity() {
    return Math.max(1, this.gpuScene.boxes.length);
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
    this.uniforms.uTriangleTraversalMode.value = this.settings.triangleTraversalMode === "bvh" ? 1 : 0;
    this.uniforms.uBackgroundColorTop.value = this.ptScene.backgroundColorTop;
    this.uniforms.uBackgroundColorBottom.value =
      this.ptScene.backgroundColorBottom;
    this.uniforms.uEnvironmentMap.value =
      this.ptScene.environmentTexture ?? this.fallbackImageTexture;
    this.updateEnvironmentDistributionUniforms();
    this.uniforms.uEnvironmentEnabled.value =
      this.settings.environmentMode === "map" && this.ptScene.environmentTexture !== null;
    this.uniforms.uEnvironmentRotation.value = this.settings.environmentRotation;
    this.uniforms.uEnvironmentIntensity.value = this.settings.environmentIntensity;
    this.uniforms.uEnvironmentLightingIntensity.value = this.settings.environmentLightingIntensity;
    this.uniforms.uEnvironmentBackgroundVisible.value = this.settings.environmentBackgroundVisible;
    this.uniforms.uEnvironmentLightingEnabled.value = this.settings.environmentLightingEnabled;

    this.uniforms.uEnableDoF.value = this.settings.enableDepthOfField;
  }

  private createUniforms(): PtUniforms {
    const halfHeight = this.camera instanceof THREE.OrthographicCamera
      ? this.settings.orthographicHeight / 2
      : Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2);
    const halfWidth = halfHeight * (this.canvas.clientWidth / Math.max(1, this.canvas.clientHeight));

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
          orthographic: this.settings.cameraProjectionMode === "orthographic",
          near: this.camera.near,
        },
      },
      uWorld: {
        value: {
          quads: this.uniformQuadValues(),
          boxes: this.uniformBoxValues(),
        },
      },
      uSphereCount: { value: this.gpuScene.spheres.length },
      uSphereData: { value: this.packedSpheres.texture },
      uSphereDataSize: { value: this.packedSpheres.size },
      uSphereBvhNodeCount: { value: this.packedSphereBvh.nodeCount },
      uSphereBvhNodeData: { value: this.packedSphereBvh.nodeTexture },
      uSphereBvhNodeDataSize: { value: this.packedSphereBvh.nodeTextureSize },
      uSphereBvhIndexData: { value: this.packedSphereBvh.indexTexture },
      uSphereBvhIndexDataSize: { value: this.packedSphereBvh.indexTextureSize },
      uQuadCount: { value: this.gpuScene.quads.length },
      uBoxCount: { value: this.gpuScene.boxes.length },
      uTriangleCount: { value: this.gpuScene.triangles.length },
      uTriangleData: { value: this.packedTriangles.texture },
      uTriangleDataSize: { value: this.packedTriangles.size },
      uBvhNodeCount: { value: this.packedTriangleBvh.nodeCount },
      uBvhNodeData: { value: this.packedTriangleBvh.nodeTexture },
      uBvhNodeDataSize: { value: this.packedTriangleBvh.nodeTextureSize },
      uBvhIndexData: { value: this.packedTriangleBvh.indexTexture },
      uBvhIndexDataSize: { value: this.packedTriangleBvh.indexTextureSize },
      uLights: { value: this.uniformLightValues() },
      uLightCount: { value: this.gpuScene.lights.length },
      uIntegratorMode: { value: integratorModeValue(this.settings.integratorMode) },
      uTriangleTraversalMode: { value: this.settings.triangleTraversalMode === "bvh" ? 1 : 0 },
      uNumSamples: { value: this.settings.numSamples },
      uMaxRayDepth: { value: this.settings.maxRayDepth },
      uMaterialData: { value: this.packedMaterials.texture },
      uMaterialDataSize: { value: this.packedMaterials.size },
      uTextureData: { value: this.packedTextures.texture },
      uTextureDataSize: { value: this.packedTextures.size },
      uImageTexture0: {
        value: this.gpuScene.imageTextures[0] ?? this.fallbackImageTexture,
      },
      uImageTexture1: { value: this.gpuScene.imageTextures[1] ?? this.fallbackImageTexture },
      uImageTexture2: { value: this.gpuScene.imageTextures[2] ?? this.fallbackImageTexture },
      uImageTexture3: { value: this.gpuScene.imageTextures[3] ?? this.fallbackImageTexture },
      uBackgroundColorTop: { value: this.ptScene.backgroundColorTop },
      uBackgroundColorBottom: { value: this.ptScene.backgroundColorBottom },
      uEnvironmentMap: { value: this.ptScene.environmentTexture ?? this.fallbackImageTexture },
      uEnvironmentConditionalCdf: {
        value: this.ptScene.environmentDistribution?.conditional ?? this.fallbackEnvironmentDistribution,
      },
      uEnvironmentMarginalCdf: {
        value: this.ptScene.environmentDistribution?.marginal ?? this.fallbackEnvironmentDistribution,
      },
      uEnvironmentDistributionSize: {
        value: this.ptScene.environmentDistribution?.size.clone() ?? new THREE.Vector2(1, 1),
      },
      uEnvironmentEnabled: { value: this.settings.environmentMode === "map" && this.ptScene.environmentTexture !== null },
      uEnvironmentBackgroundVisible: { value: this.settings.environmentBackgroundVisible },
      uEnvironmentLightingEnabled: { value: this.settings.environmentLightingEnabled },
      uEnvironmentRotation: { value: this.settings.environmentRotation },
      uEnvironmentIntensity: { value: this.settings.environmentIntensity },
      uEnvironmentLightingIntensity: { value: this.settings.environmentLightingIntensity },
      uEnableDoF: { value: this.settings.enableDepthOfField },
      uObjectMaskEnabled: {
        value:
          this.settings.renderMode === "selectedObject" ||
          this.settings.renderMode === "selectedObjectComparison",
      },
      uObjectMaskHasSelection: { value: false },
    };
    return uniforms;
  }

  private updateSceneUniforms() {
    this.uniforms.uWorld.value.quads = this.uniformQuadValues();
    this.uniforms.uWorld.value.boxes = this.uniformBoxValues();
    this.uniforms.uSphereCount.value = this.gpuScene.spheres.length;
    this.uniforms.uSphereData.value = this.packedSpheres.texture;
    this.uniforms.uSphereDataSize.value.copy(this.packedSpheres.size);
    this.uniforms.uSphereBvhNodeCount.value = this.packedSphereBvh.nodeCount;
    this.uniforms.uSphereBvhNodeData.value = this.packedSphereBvh.nodeTexture;
    this.uniforms.uSphereBvhNodeDataSize.value.copy(this.packedSphereBvh.nodeTextureSize);
    this.uniforms.uSphereBvhIndexData.value = this.packedSphereBvh.indexTexture;
    this.uniforms.uSphereBvhIndexDataSize.value.copy(this.packedSphereBvh.indexTextureSize);
    this.uniforms.uQuadCount.value = this.gpuScene.quads.length;
    this.uniforms.uBoxCount.value = this.gpuScene.boxes.length;
    this.uniforms.uTriangleCount.value = this.gpuScene.triangles.length;
    this.uniforms.uTriangleData.value = this.packedTriangles.texture;
    this.uniforms.uTriangleDataSize.value.copy(this.packedTriangles.size);
    this.uniforms.uBvhNodeCount.value = this.packedTriangleBvh.nodeCount;
    this.uniforms.uBvhNodeData.value = this.packedTriangleBvh.nodeTexture;
    this.uniforms.uBvhNodeDataSize.value.copy(this.packedTriangleBvh.nodeTextureSize);
    this.uniforms.uBvhIndexData.value = this.packedTriangleBvh.indexTexture;
    this.uniforms.uBvhIndexDataSize.value.copy(this.packedTriangleBvh.indexTextureSize);
    this.uniforms.uLights.value = this.uniformLightValues();
    this.uniforms.uLightCount.value = this.gpuScene.lights.length;
    this.uniforms.uMaterialData.value = this.packedMaterials.texture;
    this.uniforms.uMaterialDataSize.value.copy(this.packedMaterials.size);
    this.uniforms.uTextureData.value = this.packedTextures.texture;
    this.uniforms.uTextureDataSize.value.copy(this.packedTextures.size);
    this.uniforms.uImageTexture0.value = this.gpuScene.imageTextures[0] ?? this.fallbackImageTexture;
    this.uniforms.uImageTexture1.value = this.gpuScene.imageTextures[1] ?? this.fallbackImageTexture;
    this.uniforms.uImageTexture2.value = this.gpuScene.imageTextures[2] ?? this.fallbackImageTexture;
    this.uniforms.uImageTexture3.value = this.gpuScene.imageTextures[3] ?? this.fallbackImageTexture;
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

  private uniformBoxValues() {
    const capacity = this.boxUniformCapacity();
    const padding = {
      center: new THREE.Vector3(),
      halfSize: new THREE.Vector3(0.5, 0.5, 0.5),
      axisX: new THREE.Vector3(1, 0, 0),
      axisY: new THREE.Vector3(0, 1, 0),
      axisZ: new THREE.Vector3(0, 0, 1),
      materialId: 0,
    };
    return Array.from({ length: capacity }, (_, index) => this.gpuScene.boxes[index] ?? padding);
  }

  private updatePackedGeometryTextures() {
    this.packedSpheres.texture.dispose();
    this.disposePackedSphereBvh();
    this.packedSpheres = packSphereTexture(this.gpuScene.spheres, this.renderer.capabilities.maxTextureSize);
    this.packedSphereBvh = packSphereBvh(this.gpuScene.sphereBvh, this.renderer.capabilities.maxTextureSize);
    this.packedTriangles.texture.dispose();
    this.disposePackedTriangleBvh();
    this.packedTriangles = packTriangleTexture(this.gpuScene.triangles, this.renderer.capabilities.maxTextureSize);
    this.packedTriangleBvh = packTriangleBvh(this.gpuScene.triangleBvh, this.renderer.capabilities.maxTextureSize);
  }

  private disposePackedTriangleBvh() {
    this.packedTriangleBvh.nodeTexture.dispose();
    this.packedTriangleBvh.indexTexture.dispose();
  }

  private disposePackedSphereBvh() {
    this.packedSphereBvh.nodeTexture.dispose();
    this.packedSphereBvh.indexTexture.dispose();
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

  private updatePackedMaterialTextures() {
    this.packedMaterials.texture.dispose();
    this.packedTextures.texture.dispose();
    this.packedMaterials = packMaterialTexture(this.gpuScene.materials, this.renderer.capabilities.maxTextureSize);
    this.packedTextures = packTextureTexture(this.gpuScene.textures, this.renderer.capabilities.maxTextureSize);
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

  private applySceneEnvironmentSettings() {
    const rotation = THREE.MathUtils.degToRad(this.settings.environmentRotation);
    this.ptScene.scene.backgroundRotation.y = rotation;
    this.ptScene.scene.environmentRotation.y = rotation;
    this.ptScene.scene.backgroundIntensity = this.settings.environmentIntensity;
    this.ptScene.scene.environmentIntensity =
      this.settings.environmentLightingIntensity;
    this.ptScene.syncEnvironmentShadowDirection(
      this.settings.environmentRotation
    );
  }

  private watchEnvironmentTexture() {
    const loaded = this.ptScene.environmentLoaded;
    if (!loaded || loaded === this.watchedEnvironmentLoad) return;
    this.watchedEnvironmentLoad = loaded;
    loaded.then(() => {
      if (this.ptScene.environmentLoaded !== loaded) return;
      this.uniforms.uEnvironmentMap.value =
        this.ptScene.environmentTexture ?? this.fallbackImageTexture;
      this.updateEnvironmentDistributionUniforms();
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

  public onStaticSceneLoaded(listener: () => void) {
    this.staticSceneLoadedListener = listener;
  }

  private watchStaticAssets() {
    const loaded = this.ptScene.staticAssetsLoaded;
    if (!loaded || loaded === this.watchedStaticAssetLoad) return;
    this.watchedStaticAssetLoad = loaded;
    loaded.then(() => {
      if (this.ptScene.staticAssetsLoaded !== loaded) return;
      this.invalidate(PtInvalidationLevel.Scene, "static glTF loaded");
      // Static glTF triangles arrive after the renderer's initial debug helpers
      // are created. Rebuild the CPU overlays from the newly compiled geometry
      // and BVH so wireframes and bounds describe the loaded asset.
      this.setupTriangleWireframes();
      this.setupBvhHelpers();
      this.renderer.shadowMap.needsUpdate = true;
      this.staticSceneLoadedListener?.();
    }).catch((error) => console.error("Failed to load static glTF", error));
  }

  private updateEnvironmentDistributionUniforms() {
    const distribution = this.ptScene.environmentDistribution;
    this.uniforms.uEnvironmentConditionalCdf.value =
      distribution?.conditional ?? this.fallbackEnvironmentDistribution;
    this.uniforms.uEnvironmentMarginalCdf.value =
      distribution?.marginal ?? this.fallbackEnvironmentDistribution;
    this.uniforms.uEnvironmentDistributionSize.value.copy(
      distribution?.size ?? new THREE.Vector2(1, 1)
    );
  }

  private initializeComposerPasses() {
    this.renderPass = new RenderPass(this.ptScene.scene, this.camera);
    this.ptPass = new RenderPass(
      this.shaderCanvas.screenScene,
      this.shaderCanvas.screenCamera
    );
    this.hybridPass = new RenderPass(this.hybridScene, this.hybridCamera);
    this.outlinePass = new OutlinePass(
      new THREE.Vector2(window.innerWidth * 2, window.innerHeight * 2),
      this.ptScene.scene,
      this.camera
    );

    this.composer.setSize(window.innerWidth, window.innerHeight);
    this.composer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    this.composer.addPass(this.renderPass);
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;

    this.composer.addPass(this.ptPass);
    this.composer.addPass(this.hybridPass);

    this.composer.addPass(this.outlinePass);

    this.gammaCorrectionPass = new ShaderPass(GammaCorrectionShader);
    this.composer.addPass(this.gammaCorrectionPass);
    this.updateComposerMode();
  }

  private updateComposerScene() {
    this.renderPass.scene = this.ptScene.scene;
    this.renderPass.camera = this.camera;

    this.outlinePass.selectedObjects = [];
    this.outlinePass.renderScene = this.ptScene.scene;
    this.outlinePass.renderCamera = this.camera;

    this.updateComposerMode();
  }

  private updateComposerMode() {
    const objectMasked =
      this.settings.renderMode === "selectedObject" ||
      this.settings.renderMode === "selectedObjectComparison";
    this.hybridMaterial.uniforms.uRegionMode.value = this.settings.renderMode === "region";
    this.hybridMaterial.uniforms.uObjectMode.value = this.settings.renderMode === "selectedObject";
    this.hybridMaterial.uniforms.uObjectComparisonMode.value =
      this.settings.renderMode === "selectedObjectComparison";
    this.uniforms.uObjectMaskEnabled.value = objectMasked;
    this.shaderCanvas.setStencilMaskEnabled(objectMasked);
    this.renderPass.enabled = this.settings.renderMode === "raster";
    this.ptPass.enabled = this.settings.renderMode === "pathtraced";
    this.hybridPass.enabled =
      this.settings.renderMode === "comparison" ||
      this.settings.renderMode === "region" ||
      objectMasked;
  }

  private resizeHybridTarget(width: number, height: number, pixelRatio: number) {
    const targetWidth = Math.max(1, Math.floor(width * pixelRatio));
    const targetHeight = Math.max(1, Math.floor(height * pixelRatio));
    for (const target of [this.hybridRasterTarget, this.objectIdTarget]) {
      target.setSize(targetWidth, targetHeight);
      target.viewport.set(0, 0, targetWidth, targetHeight);
      target.scissor.set(0, 0, targetWidth, targetHeight);
      target.scissorTest = false;
    }
  }

  private objectIdColor(objectId: string) {
    const existing = this.objectIdColors.get(objectId);
    if (existing) return existing;
    const encoded = this.objectIdColors.size + 1;
    const color = new THREE.Vector3(
      (encoded & 0xff) / 255,
      ((encoded >> 8) & 0xff) / 255,
      ((encoded >> 16) & 0xff) / 255
    );
    this.objectIdColors.set(objectId, color);
    return color;
  }

  private objectIdMaterial(objectId: string) {
    const existing = this.objectIdMaterials.get(objectId);
    if (existing) return existing;
    const material = new THREE.ShaderMaterial({
      uniforms: { uIdColor: { value: this.objectIdColor(objectId) } },
      vertexShader: `
        void main() {
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uIdColor;
        void main() { gl_FragColor = vec4(uIdColor, 1.0); }
      `,
      side: THREE.DoubleSide,
      depthTest: true,
      depthWrite: true,
      toneMapped: false,
    });
    this.objectIdMaterials.set(objectId, material);
    return material;
  }

  private renderObjectIds() {
    const traceable = new Map<THREE.Mesh, string>();
    for (const mesh of [
      ...this.ptScene.getSphereMeshes(),
      ...this.ptScene.getQuadMeshes(),
      ...this.ptScene.getBoxMeshes(),
      ...this.ptScene.getTriangleMeshes(),
    ]) {
      traceable.set(mesh, mesh.userData.pathTracer.objectId);
    }

    const restored: Array<{
      mesh: THREE.Mesh;
      material: THREE.Material | THREE.Material[];
      visible: boolean;
    }> = [];
    this.ptScene.scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      restored.push({ mesh: object, material: object.material, visible: object.visible });
      const objectId = traceable.get(object);
      if (objectId && object.visible) object.material = this.objectIdMaterial(objectId);
      else object.visible = false;
    });

    const clearColor = this.renderer.getClearColor(new THREE.Color()).clone();
    const clearAlpha = this.renderer.getClearAlpha();
    this.renderer.setRenderTarget(this.objectIdTarget);
    this.renderer.setClearColor(0x000000, 1);
    this.renderer.clear(true, true, true);
    this.renderer.render(this.ptScene.scene, this.camera);
    this.renderer.setRenderTarget(null);
    this.renderer.setClearColor(clearColor, clearAlpha);

    for (const entry of restored) {
      entry.mesh.material = entry.material;
      entry.mesh.visible = entry.visible;
    }
  }

  private renderSelectedObjectStencil(renderer: THREE.WebGLRenderer) {
    renderer.clear(false, true, true);
    if (this.selectedObjectIds.size === 0) return;

    const traceable = new Map<THREE.Mesh, string>();
    for (const mesh of [
      ...this.ptScene.getSphereMeshes(),
      ...this.ptScene.getQuadMeshes(),
      ...this.ptScene.getBoxMeshes(),
      ...this.ptScene.getTriangleMeshes(),
    ]) {
      traceable.set(mesh, mesh.userData.pathTracer.objectId);
    }
    const restored: Array<{
      mesh: THREE.Mesh;
      material: THREE.Material | THREE.Material[];
      visible: boolean;
    }> = [];
    this.ptScene.scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      restored.push({ mesh: object, material: object.material, visible: object.visible });
      const objectId = traceable.get(object);
      object.visible = object.visible && Boolean(
        objectId && this.selectedObjectIds.has(objectId)
      );
      if (object.visible) object.material = this.objectMaskStencilMaterial;
    });
    renderer.render(this.ptScene.scene, this.camera);

    for (const entry of restored) {
      entry.mesh.material = entry.material;
      entry.mesh.visible = entry.visible;
    }
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

  private setupTriangleWireframes() {
    for (const wireframe of this.triangleWireframes.values()) {
      wireframe.geometry.dispose();
      (wireframe.material as THREE.Material).dispose();
      this.debugOverlayScene.remove(wireframe);
    }
    this.triangleWireframes.clear();
    for (const mesh of this.ptScene.getTriangleMeshes()) {
      const wireframe = new THREE.LineSegments(
        new THREE.WireframeGeometry(mesh.geometry),
        new THREE.LineBasicMaterial({
          color: 0x9bdcff,
          transparent: true,
          opacity: 0.9,
          depthTest: false,
          depthWrite: false,
        })
      );
      wireframe.matrixAutoUpdate = false;
      wireframe.visible = false;
      wireframe.userData.sourceMesh = mesh;
      this.debugOverlayScene.add(wireframe);
      this.triangleWireframes.set(mesh.userData.pathTracer.objectId, wireframe);
    }
    this.updateTriangleWireframeVisibility();
  }

  private updateTriangleWireframeVisibility() {
    for (const [objectId, wireframe] of this.triangleWireframes) {
      wireframe.visible = this.isTriangleWireframeVisible(objectId);
    }
  }

  private syncTriangleWireframes() {
    for (const wireframe of this.triangleWireframes.values()) {
      const mesh = wireframe.userData.sourceMesh as THREE.Object3D;
      mesh.updateWorldMatrix(true, false);
      wireframe.matrix.copy(mesh.matrixWorld);
    }
  }

  private setupBvhHelpers() {
    this.disposeBvhHelpers();
    this.bvhOverlayNodes.length = 0;
    this.bvhOverlayNodesByKey.clear();
    const descriptions = describeTriangleBvh(this.gpuScene.triangleBvh);
    for (const description of descriptions) {
      const node = this.gpuScene.triangleBvh.nodes[description.index]!;
      const overlayNode: BvhOverlayNode = {
        index: description.index,
        depth: description.depth,
        leaf: description.leaf,
        kind: "triangle",
        boundsMin: node.boundsMin,
        boundsMax: node.boundsMax,
      };
      this.bvhOverlayNodes.push(overlayNode);
      this.bvhOverlayNodesByKey.set(`triangle:${description.index}`, overlayNode);
    }
    const sphereDescriptions = describeSphereBvh(this.gpuScene.sphereBvh);
    for (const description of sphereDescriptions) {
      const node = this.gpuScene.sphereBvh.nodes[description.index]!;
      const overlayNode: BvhOverlayNode = {
        index: description.index,
        depth: description.depth,
        leaf: description.leaf,
        kind: "sphere",
        boundsMin: node.boundsMin,
        boundsMax: node.boundsMax,
      };
      this.bvhOverlayNodes.push(overlayNode);
      this.bvhOverlayNodesByKey.set(`sphere:${description.index}`, overlayNode);
    }
    this.rebuildBvhHelpers();
    this.updateBvhHelperVisibility();
  }

  private disposeBvhHelpers() {
    for (const helper of this.bvhHelpers) {
      helper.geometry.dispose();
      helper.material.dispose();
      this.debugOverlayScene.remove(helper);
    }
    this.bvhHelpers.length = 0;
  }

  private rebuildBvhHelpers() {
    this.disposeBvhHelpers();
    if (!this.settings.bvhOverlayEnabled) return;

    const batches = new Map<string, { nodes: BvhOverlayNode[]; color: number; opacity: number }>();
    for (const node of this.bvhOverlayNodes) {
      if (node.depth > this.settings.bvhOverlayDepth) continue;
      const key = `${node.kind}:${node.leaf ? "leaf" : "branch"}`;
      let batch = batches.get(key);
      if (!batch) {
        batch = {
          nodes: [],
          color: node.kind === "sphere"
            ? (node.leaf ? 0xfbbf24 : 0xc084fc)
            : (node.leaf ? 0x9bea78 : 0x63b3ed),
          opacity: node.leaf ? 0.85 : 0.55,
        };
        batches.set(key, batch);
      }
      batch.nodes.push(node);
    }

    for (const batch of batches.values()) {
      const positions: number[] = [];
      for (const node of batch.nodes) {
        positions.push(...this.boxEdgePositions(node.boundsMin, node.boundsMax));
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      const material = new THREE.LineBasicMaterial({
        color: batch.color,
        transparent: true,
        opacity: batch.opacity,
        depthTest: false,
        depthWrite: false,
      });
      const helper = new THREE.LineSegments(geometry, material);
      helper.frustumCulled = false;
      this.debugOverlayScene.add(helper);
      this.bvhHelpers.push(helper);
    }
  }

  private createNativeDebugLines(positions: number[], color: number, opacity = 1) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    const material = new THREE.LineBasicMaterial({
      color,
      transparent: opacity < 1,
      opacity,
      depthTest: false,
      depthWrite: false,
    });
    const helper = new THREE.LineSegments(geometry, material);
    helper.frustumCulled = false;
    this.debugOverlayScene.add(helper);
    return helper;
  }

  private boxEdgePositions(min: THREE.Vector3, max: THREE.Vector3) {
    const corners = [
      new THREE.Vector3(min.x, min.y, min.z), new THREE.Vector3(max.x, min.y, min.z),
      new THREE.Vector3(max.x, max.y, min.z), new THREE.Vector3(min.x, max.y, min.z),
      new THREE.Vector3(min.x, min.y, max.z), new THREE.Vector3(max.x, min.y, max.z),
      new THREE.Vector3(max.x, max.y, max.z), new THREE.Vector3(min.x, max.y, max.z),
    ];
    const edges = [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]];
    return edges.flatMap(([a, b]) => [...corners[a]!.toArray(), ...corners[b]!.toArray()]);
  }

  private updateBvhHelperVisibility() {
    for (const helper of this.bvhTraversalNodeHelpers) this.disposeDebugLine(helper);
    this.bvhTraversalNodeHelpers.length = 0;
    const inspection = this.bvhTraversalState;
    const visibleEvents = inspection
      ? inspection.events.slice(0, Math.max(0, inspection.step + 1))
      : [];
    const nodeEvents = visibleEvents.filter((event) => event.kind === "node");
    const currentEvent = visibleEvents.at(-1);
    const highlightedPositions = new Map<number, number[]>();
    for (const event of nodeEvents) {
      const node = this.bvhOverlayNodesByKey.get(`${event.geometryKind}:${event.nodeIndex}`);
      if (!node) continue;
      const isCurrent = currentEvent?.kind === "node" &&
        currentEvent.geometryKind === event.geometryKind &&
        currentEvent.nodeIndex === event.nodeIndex;
      const color = isCurrent ? 0xffffff : event.hit ? 0xfbbf24 : 0xf87171;
      const positions = highlightedPositions.get(color) ?? [];
      positions.push(...this.boxEdgePositions(node.boundsMin, node.boundsMax));
      highlightedPositions.set(color, positions);
    }
    for (const [color, positions] of highlightedPositions) {
      this.bvhTraversalNodeHelpers.push(
        this.createNativeDebugLines(positions, color)
      );
    }
  }

  private readonly renderLoop = () => {
    if (this.renderingPaused) return;
    const frameStartedAt = performance.now();
    if (this.previousFrameStartedAt > 0) {
      const frameTimeMs = frameStartedAt - this.previousFrameStartedAt;
      for (const listener of this.frameTimingListeners) listener(frameTimeMs);
    }
    this.previousFrameStartedAt = frameStartedAt;
    // Some window managers apply snapping/fullscreen changes without a useful
    // resize-event sequence. Polling these three scalar values once per frame
    // makes the drawing buffer follow the real browser viewport in that case,
    // while the equality guard keeps the steady-state cost negligible.
    this.syncViewportSize();
    this.renderer.clear();

    this.orbitControls?.update();
    this.cameraDebugControls?.update();

    const rasterVisible = this.settings.renderMode !== "pathtraced";
    const pathtracedVisible = this.settings.renderMode !== "raster";

    if (rasterVisible) {
      let hasEmissiveQuad = false;
      for (const quad of this.ptScene.getQuadMeshes()) {
        syncEmissiveQuadPreview(quad);
        const preview = quad.children.find(
          (child) => child.userData.pathTracerEmissiveQuadPreview === true
        );
        hasEmissiveQuad ||= preview?.visible === true;
      }
      // Emissive-quad studies use their aligned area-light approximation.
      // Avoid layering the legacy preview sun and a second shadow projection
      // over the same zero-thickness geometry.
      this.ptScene.dirLight.castShadow = !hasEmissiveQuad;
    }

    if (
      this.settings.renderMode === "selectedObject" ||
      this.settings.renderMode === "selectedObjectComparison"
    ) {
      this.renderObjectIds();
    }

    const pauseFullFrameHybridTracing = this.hybridRegionInteractionActive && (
      (this.settings.renderMode === "region" && this.settings.regionTracingMode === "fullFrame") ||
      ((this.settings.renderMode === "comparison" ||
        this.settings.renderMode === "selectedObjectComparison") &&
        this.settings.comparisonTracingMode === "fullFrame")
    );

    if (
      pathtracedVisible &&
      !pauseFullFrameHybridTracing &&
      !this.cameraDebugInteractionActive
    ) {
      this.camera.updateMatrixWorld();
      this.camera.updateProjectionMatrix();

      this.camera.getWorldDirection(this.cameraForward).normalize();
      this.cameraRight
        .crossVectors(this.cameraForward, this.worldUp)
        .normalize();
      this.cameraUp
        .crossVectors(this.cameraRight, this.cameraForward)
        .normalize();
      const region =
        this.settings.renderMode === "region" &&
        this.settings.regionTracingMode === "roiOnly"
        ? {
            left: this.hybridRegion.x,
            bottom: this.hybridRegion.y,
            width: this.hybridRegion.z - this.hybridRegion.x,
            height: this.hybridRegion.w - this.hybridRegion.y,
          }
        : this.settings.renderMode === "comparison" &&
            this.settings.comparisonTracingMode === "pathtracedSide"
          ? {
              left: this.hybridSeam,
              bottom: 0,
              width: 1 - this.hybridSeam,
              height: 1,
            }
          : this.settings.renderMode === "selectedObjectComparison" &&
              this.settings.comparisonTracingMode === "pathtracedSide"
            ? {
                left: this.hybridSeam,
                bottom: 0,
                width: 1 - this.hybridSeam,
                height: 1,
              }
          : undefined;
      this.shaderCanvas.render(
        this.renderer,
        region,
        this.settings.renderMode === "selectedObject" ||
          this.settings.renderMode === "selectedObjectComparison"
          ? (renderer) => this.renderSelectedObjectStencil(renderer)
          : undefined
      );
    }

    if (
      this.settings.renderMode === "comparison" ||
      this.settings.renderMode === "region" ||
      this.settings.renderMode === "selectedObject" ||
      this.settings.renderMode === "selectedObjectComparison"
    ) {
      this.renderer.setRenderTarget(this.hybridRasterTarget);
      this.renderer.clear();
      this.renderer.render(this.ptScene.scene, this.camera);
      this.renderer.setRenderTarget(null);
      this.hybridMaterial.uniforms.tRaster.value = this.hybridRasterTarget.texture;
      this.hybridMaterial.uniforms.tPathtraced.value = this.shaderCanvas.outputTexture;
      this.hybridMaterial.uniforms.tObjectIds.value = this.objectIdTarget.texture;
    }

    // transform controls
    this.transformControls.update(this.clock.getDelta());

    if (this.pendingCaptureRequests.length > 0 && !this.pendingCaptureRequests[0]!.includePanels) {
      const outlineEnabled = this.outlinePass.enabled;
      this.outlinePass.enabled = this.pendingCaptureRequests[0]!.includeOverlays && outlineEnabled;
      this.composer.render();
      if (this.pendingCaptureRequests[0]?.includeOverlays) {
        this.ptScene.annotationGroup.traverse((object) => {
          if (object.userData.billboard === true) object.quaternion.copy(this.camera.quaternion);
        });
        this.renderer.clearDepth();
        this.renderer.render(this.ptScene.annotationGroup, this.camera);
      }
      this.snapshotPendingCaptures();
      this.outlinePass.enabled = outlineEnabled;
      // Restore the interactive presentation immediately so capturing does not
      // produce a one-frame selection-outline flicker on screen.
      this.composer.render();
    } else {
      this.composer.render();
    }
    this.syncTriangleWireframes();
    this.ptScene.annotationGroup.traverse((object) => {
      if (object.userData.billboard === true) object.quaternion.copy(this.camera.quaternion);
    });
    this.renderer.clearDepth();
    this.renderer.render(this.debugOverlayScene, this.camera);
    this.renderer.clearDepth();
    this.renderer.render(this.gizmoScene, this.camera);
    this.renderCameraDebugView();
    if (this.pendingCaptureRequests[0]?.includePanels) this.snapshotPendingCaptures();

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
    const halfHeight = this.camera instanceof THREE.OrthographicCamera
      ? this.settings.orthographicHeight / 2
      : Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2);
    this.uniforms.uCamera.value.halfHeight = halfHeight;
    const aspect = this.canvas.clientWidth / Math.max(1, this.canvas.clientHeight);
    this.uniforms.uCamera.value.halfWidth = halfHeight * aspect;
    this.uniforms.uCamera.value.orthographic = this.camera instanceof THREE.OrthographicCamera;
    this.uniforms.uCamera.value.near = this.camera.near;
  }

  private updateCameraAspect(aspect: number) {
    if (this.camera instanceof THREE.PerspectiveCamera) {
      this.camera.aspect = aspect;
      return;
    }
    const halfHeight = this.settings.orthographicHeight / 2;
    this.camera.left = -halfHeight * aspect;
    this.camera.right = halfHeight * aspect;
    this.camera.top = halfHeight;
    this.camera.bottom = -halfHeight;
  }

  public dispose() {
    this.bvhTraversalInvalidated = null;
    this.renderer.setAnimationLoop(null);
    window.removeEventListener("resize", this.handleResize);

    this.orbitControls.removeEventListener("change", this.handleOrbitChange);
    this.orbitControls.dispose();
    this.cameraDebugControls?.dispose();
    this.cameraDebugControls = null;

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
    this.hybridRasterTarget.dispose();
    this.objectIdTarget.dispose();
    for (const material of this.objectIdMaterials.values()) material.dispose();
    this.objectIdMaterials.clear();
    this.objectIdColors.clear();
    this.objectMaskStencilMaterial.dispose();
    this.hybridMaterial.dispose();
    this.hybridScene.traverse((object) => {
      if (object instanceof THREE.Mesh) object.geometry.dispose();
    });
    this.gpuScene.dispose();
    this.packedSpheres.texture.dispose();
    this.disposePackedSphereBvh();
    this.packedTriangles.texture.dispose();
    this.disposePackedTriangleBvh();
    this.packedMaterials.texture.dispose();
    this.packedTextures.texture.dispose();
    this.fallbackImageTexture.dispose();
    for (const wireframe of this.triangleWireframes.values()) {
      wireframe.geometry.dispose();
      (wireframe.material as THREE.Material).dispose();
    }
    this.triangleWireframes.clear();
    this.disposeBvhHelpers();
    for (const helper of this.bvhTraversalNodeHelpers) this.disposeDebugLine(helper);
    this.bvhTraversalNodeHelpers.length = 0;
    this.bvhOverlayNodes.length = 0;
    this.bvhOverlayNodesByKey.clear();
    this.bvhHelpers.length = 0;
    this.bvhTraversalRay = this.disposeDebugLine(this.bvhTraversalRay);
    this.bvhTraversalTriangle = this.disposeDebugLine(this.bvhTraversalTriangle);
    this.bvhTraversalHit = this.disposeDebugLine(this.bvhTraversalHit);
    this.cameraDebugGroup.traverse((object) => {
      const renderable = object as THREE.Mesh;
      renderable.geometry?.dispose?.();
      const material = renderable.material;
      if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
      else material?.dispose?.();
    });
    this.disposePostProcessing();
    this.renderer.dispose();
  }
}
