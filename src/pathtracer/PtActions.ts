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
  isPtAnalyticLightNode,
  syncAnalyticLightPreview,
} from "./PtAnalyticLight";
import PtStore from "./PtStore";
import type { PtStateListener } from "./PtStore";
import type {
  AccumulationFormat,
  PtSettings,
  PtState,
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
import PtMaterial from "./PtMaterial";

interface TransformSnapshot {
  readonly position: THREE.Vector3;
  readonly quaternion: THREE.Quaternion;
  readonly scale: THREE.Vector3;
}

interface MaterialSnapshot {
  readonly color: number;
  readonly roughness?: number;
  readonly ior?: number;
  readonly texture: PtTexture;
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
    this.renderer.onStaticSceneLoaded(() => this.publishSceneObjects());
    this.configureTransformControls();
    this.publishSceneObjects();
  }

  public getState() {
    return this.store.getState();
  }

  public getTriangleBvhStats() {
    return this.renderer.getTriangleBvhStats();
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
    this.renderer.setBvhTraversalVisualization(null);
    this.renderer.transformControls.detach();
    this.renderer.outlinePass.selectedObjects = [];
    this.renderer.setScene(scene, false);
    this.renderer.setFov(scene.camera.fov, false);
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
      sceneObjects: this.createSceneObjectState(sceneKey),
      bvhTraversal: {
        armed: false,
        step: -1,
        rayOrigin: null,
        rayDirection: null,
        events: [],
        result: null,
      },
    }));
    Object.assign(this.renderer.settings, this.store.getState().settings);
    this.publishHistory();
    this.renderer.invalidate(PtInvalidationLevel.Scene, "scene preset replaced");
    this.nextSphereName = scene.getSphereMeshes().length;
    this.nextQuadName = scene.getQuadMeshes().length;
  }

  public setPathtracingEnabled(enabled: boolean) {
    this.renderer.setPathtracingEnabled(enabled);
    this.updateSetting("pathtracingEnabled", enabled);
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
    this.renderer.ptScene.scene.environment = null;
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
      ? this.renderer.ptScene.environmentTexture
      : null;
    this.renderer.invalidate(PtInvalidationLevel.Settings, "environment lighting changed");
    this.updateSetting("environmentLightingEnabled", value);
  }

  public setFov(fov: number) {
    this.renderer.setFov(fov);
    this.updateSetting("fov", fov);
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
    this.renderer.setDepthOfFieldEnabled(enabled);
    this.updateSetting("enableDepthOfField", enabled);
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

  public selectObject(object: PtEditableObject | null) {
    this.commitSelectedTransform();
    this.commitMaterialEdit();
    this.commitSelectedLightEdit();
    this.selectedObject = object;
    this.renderer.setSelectedTriangleMesh(object && isPtTriangleMesh(object)
      ? object.userData.pathTracer.objectId
      : null);
    if (!object) {
      this.renderer.outlinePass.selectedObjects = [];
      this.renderer.transformControls.detach();
      this.store.update((state) => ({
        ...state,
        selection: this.emptySelection(),
      }));
      return;
    }

    this.renderer.outlinePass.selectedObjects = [object];
    this.renderer.transformControls.attach(object);
    if (
      isPtAnalyticLightNode(object) &&
      (this.renderer.transformControls.mode === "scale" ||
        (object.userData.pathTracer.lightType === "point" &&
          this.renderer.transformControls.mode === "rotate"))
    ) {
      this.setTransformMode("translate");
    }
    this.configureTransformControls();
    this.publishSelection();
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
    this.renderer.ptScene.getMaterial(materialId).color.copy(color);
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
      material.roughness = fuzz;
    }
    this.renderer.invalidate(
      PtInvalidationLevel.Material,
      `material ${materialId} fuzz changed`
    );
    this.publishSelection();
  }

  public setMaterialIor(materialId: number, ior: number) {
    this.beginMaterialEdit(materialId);
    const material = this.renderer.ptScene.getMaterial(materialId);
    if (material instanceof THREE.MeshPhysicalMaterial) material.ior = ior;
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
    this.renderer.invalidate(PtInvalidationLevel.Material, `material ${materialId} emission changed`);
    this.publishSelection();
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
    const { materialId, materialType, texture, emissionStrength, emissionTwoSided } = getMaterialMetadata(
      selectedObject.material
    );
    const material = this.renderer.ptScene.getMaterial(materialId);
    const materialKinds = ["Lambert", "Metal", "Dielectric", "Emissive"] as const;
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
        } : null,
        material: {
          id: materialId,
          kind: materialKinds[materialType] ?? "Unknown",
          color: `#${material.color.getHexString()}`,
          roughness:
            material instanceof THREE.MeshStandardMaterial
              ? material.roughness
              : null,
          ior:
            material instanceof THREE.MeshPhysicalMaterial
              ? material.ior
              : null,
          emissionStrength: materialType === 3 ? emissionStrength : null,
          emissionTwoSided: materialType === 3 ? emissionTwoSided : null,
          texture: {
            type: texture.type === PtTextureType.Image ? "image" : texture.type === PtTextureType.Checker ? "checker" : texture.type === PtTextureType.Perlin ? "perlin" : "constant",
            label: texture.type === PtTextureType.Image
              ? (findBuiltinTexture(texture.source)?.label ?? "Imported image")
              : texture.type === PtTextureType.Checker ? "Checker" : texture.type === PtTextureType.Perlin ? "Perlin marble" : "Solid color",
            source: texture.type === PtTextureType.Image ? texture.source : null,
            colorA: texture.type === PtTextureType.Checker || texture.type === PtTextureType.Perlin ? `#${texture.colorA.getHexString()}` : null,
            colorB: texture.type === PtTextureType.Checker || texture.type === PtTextureType.Perlin ? `#${texture.colorB.getHexString()}` : null,
            scale: texture.type === PtTextureType.Checker || texture.type === PtTextureType.Perlin ? texture.scale : null,
            turbulence: texture.type === PtTextureType.Perlin ? texture.turbulence : null,
          },
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
    return {
      color: material.color.getHex(),
      roughness:
        material instanceof THREE.MeshStandardMaterial
          ? material.roughness
          : undefined,
      ior:
        material instanceof THREE.MeshPhysicalMaterial
          ? material.ior
          : undefined,
      texture: cloneTexture(getMaterialMetadata(material).texture),
      emissionStrength: getMaterialMetadata(material).emissionStrength,
      emissionTwoSided: getMaterialMetadata(material).emissionTwoSided,
    };
  }

  private applyMaterial(materialId: number, snapshot: MaterialSnapshot) {
    const material = this.renderer.ptScene.getMaterial(materialId);
    this.renderer.ptScene.setMaterialTexture(materialId, cloneTexture(snapshot.texture));
    material.color.setHex(snapshot.color);
    const metadata = getMaterialMetadata(material);
    metadata.emissionStrength = snapshot.emissionStrength;
    metadata.emissionTwoSided = snapshot.emissionTwoSided;
    if (
      snapshot.roughness !== undefined &&
      material instanceof THREE.MeshStandardMaterial
    ) {
      material.roughness = snapshot.roughness;
    }
    if (
      snapshot.ior !== undefined &&
      material instanceof THREE.MeshPhysicalMaterial
    ) {
      material.ior = snapshot.ior;
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

  private updateProceduralTexture(materialId: number, update: (texture: Extract<PtTexture, { type: PtTextureType.Checker | PtTextureType.Perlin }>) => void) {
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
      a.emissionStrength === b.emissionStrength &&
      a.emissionTwoSided === b.emissionTwoSided &&
      JSON.stringify(this.serializeTexture(a.texture)) === JSON.stringify(this.serializeTexture(b.texture))
    );
  }

  private serializeTexture(texture: PtTexture) {
    if (texture.type === PtTextureType.Constant) return [texture.type, texture.color.getHex()];
    if (texture.type === PtTextureType.Checker) return [texture.type, texture.colorA.getHex(), texture.colorB.getHex(), texture.scale];
    if (texture.type === PtTextureType.Perlin) return [texture.type, texture.colorA.getHex(), texture.colorB.getHex(), texture.scale, texture.turbulence];
    return [texture.type, texture.source];
  }

  private applySettings(settings: PtSettings) {
    const current = this.store.getState().settings;
    if (current.pathtracingEnabled !== settings.pathtracingEnabled) {
      this.setPathtracingEnabled(settings.pathtracingEnabled);
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
    if (current.fov !== settings.fov) this.setFov(settings.fov);
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
