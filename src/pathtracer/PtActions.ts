import * as THREE from "three";
import { PresetPtScenes } from "./PresetPtScenes";
import PtRenderer from "./PtRenderer";
import {
  getMaterialMetadata,
  sphereRadius,
  type PtSphereMesh,
} from "./PtScene";
import PtStore from "./PtStore";
import type { PtStateListener } from "./PtStore";
import type {
  AccumulationFormat,
  PtSettings,
  PtState,
  TransformMode,
} from "./PtState";
import { PtInvalidationLevel } from "./PtInvalidation";
import CommandHistory from "./CommandHistory";

interface TransformSnapshot {
  readonly position: THREE.Vector3;
  readonly scale: THREE.Vector3;
}

interface MaterialSnapshot {
  readonly color: number;
  readonly roughness?: number;
  readonly ior?: number;
}

export default class PtActions {
  private selectedObject: PtSphereMesh | null = null;
  private readonly history = new CommandHistory(100);
  private pendingTransform: {
    object: PtSphereMesh;
    before: TransformSnapshot;
  } | null = null;
  private pendingMaterial: {
    materialId: number;
    before: MaterialSnapshot;
  } | null = null;
  private pendingSettings: {
    label: string;
    before: PtSettings;
  } | null = null;
  private nextSphereName = 0;

  constructor(
    private readonly store: PtStore,
    private readonly renderer: PtRenderer
  ) {
    this.nextSphereName = renderer.ptScene.getSphereMeshes().length;
    this.publishSceneObjects();
  }

  public getState() {
    return this.store.getState();
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

  public undo() {
    const canceledTransform = this.cancelSelectedTransform();
    const canceledMaterial = this.cancelMaterialEdit();
    const canceledSettings = this.cancelSettingsEdit();
    if (canceledTransform || canceledMaterial || canceledSettings) return true;
    const changed = this.history.undo();
    if (changed) this.publishHistory();
    return changed;
  }

  public redo() {
    const canceledTransform = this.cancelSelectedTransform();
    const canceledMaterial = this.cancelMaterialEdit();
    const canceledSettings = this.cancelSettingsEdit();
    if (canceledTransform || canceledMaterial || canceledSettings) return true;
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
    this.pendingSettings = null;
    // Presets are whole-scene replacements, so commands referring to the old
    // scene are intentionally discarded rather than replayed into a new one.
    this.history.clear();
    this.selectedObject = null;
    this.renderer.transformControls.detach();
    this.renderer.outlinePass.selectedObjects = [];
    this.renderer.setScene(scene, false);
    this.renderer.setFov(scene.camera.fov, false);
    this.renderer.setDepthOfFieldEnabled(false, false);
    this.renderer.setNumSamples(1, false);
    this.setTransformMode("translate");

    this.store.update((state) => ({
      ...state,
      sceneKey,
      settings: {
        ...state.settings,
        backgroundColorTop: `#${scene.backgroundColorTop.getHexString()}`,
        backgroundColorBottom: `#${scene.backgroundColorBottom.getHexString()}`,
        fov: scene.camera.fov,
        numSamples: 1,
        enableDepthOfField: false,
        transformMode: "translate",
      },
      selection: this.emptySelection(),
      sceneObjects: this.createSceneObjectState(sceneKey),
    }));
    Object.assign(this.renderer.settings, this.store.getState().settings);
    this.publishHistory();
    this.renderer.invalidate(PtInvalidationLevel.Scene, "scene preset replaced");
    this.nextSphereName = scene.getSphereMeshes().length;
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
    this.renderer.transformControls.mode = mode;
    const scaling = mode === "scale";
    this.renderer.transformControls.showY = !scaling;
    this.renderer.transformControls.showZ = !scaling;
    this.updateSetting("transformMode", mode);
  }

  public selectObject(object: PtSphereMesh | null) {
    this.commitSelectedTransform();
    this.commitMaterialEdit();
    this.selectedObject = object;
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

  public removeSelectedObject() {
    const object = this.selectedObject;
    if (!object) return false;
    this.commitSelectedTransform();
    this.commitMaterialEdit();
    const scene = this.renderer.ptScene;
    const index = scene.intersectGroup.children.indexOf(object);
    if (index < 0) return false;

    const remove = () => {
      scene.removeSphereMesh(object);
      this.publishSceneObjects();
      if (this.selectedObject === object) this.selectObject(null);
      this.renderer.invalidate(PtInvalidationLevel.Scene, "sphere removed");
    };
    const restore = () => {
      scene.insertSphereMesh(object, index);
      this.publishSceneObjects();
      this.selectObject(object);
      this.renderer.invalidate(PtInvalidationLevel.Scene, "sphere restored");
    };

    remove();
    this.history.record({
      label: `Remove sphere ${index}`,
      execute: remove,
      undo: restore,
    });
    this.publishHistory();
    return true;
  }

  public duplicateSelectedObject() {
    const source = this.selectedObject;
    if (!source) return false;
    this.commitSelectedTransform();
    this.commitMaterialEdit();
    const scene = this.renderer.ptScene;
    const object = source.clone() as PtSphereMesh;
    object.position.x += sphereRadius(source) * 2.25;
    object.userData.pathTracer = {
      objectId: THREE.MathUtils.generateUUID(),
      objectName: `${source.userData.pathTracer.objectName} Copy`,
      primitiveIndex: scene.getSphereMeshes().length,
      primitiveType: "sphere",
    };
    const index = scene.intersectGroup.children.length;

    const insert = () => {
      scene.insertSphereMesh(object, index);
      this.publishSceneObjects();
      this.selectObject(object);
      this.renderer.invalidate(PtInvalidationLevel.Scene, "sphere duplicated");
    };
    const remove = () => {
      scene.removeSphereMesh(object);
      this.publishSceneObjects();
      if (this.selectedObject === object) this.selectObject(null);
      this.renderer.invalidate(
        PtInvalidationLevel.Scene,
        "duplicated sphere removed"
      );
    };

    insert();
    this.history.record({
      label: `Duplicate sphere ${source.userData.pathTracer.primitiveIndex}`,
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
      `sphere ${this.selectedObject.userData.pathTracer.primitiveIndex} position changed`
    );
    this.publishSelection();
  }

  public setSelectedRadius(radius: number) {
    if (!this.selectedObject) return;
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

  public syncSelectedTransform() {
    if (!this.selectedObject) return;
    if (this.renderer.transformControls.mode === "scale") {
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
      pending.object.scale.copy(snapshot.scale);
      this.renderer.invalidate(
        PtInvalidationLevel.Geometry,
        `sphere ${pending.object.userData.pathTracer.primitiveIndex} transform history applied`
      );
      if (this.selectedObject === pending.object) this.publishSelection();
    };

    this.history.record({
      label: `Transform sphere ${pending.object.userData.pathTracer.primitiveIndex}`,
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
    pending.object.scale.copy(pending.before.scale);
    this.renderer.invalidate(
      PtInvalidationLevel.Geometry,
      `sphere ${pending.object.userData.pathTracer.primitiveIndex} transform canceled`
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
    const sphereIndex = selectedObject.userData.pathTracer.primitiveIndex;
    const { x, y, z } = selectedObject.position;
    const radius = sphereRadius(selectedObject);
    const { materialId, materialType } = getMaterialMetadata(
      selectedObject.material
    );
    const material = this.renderer.ptScene.getMaterial(materialId);
    const materialKinds = ["Lambert", "Metal", "Dielectric"] as const;
    this.store.update((state) => ({
      ...state,
      selection: {
        objectId: selectedObject.userData.pathTracer.objectId,
        sphereIndex,
        position: { x, y, z },
        radius,
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
        },
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
        selectable: false,
        traceable: false,
        capability: "preview lighting",
      },
      {
        id: "group:traceables",
        label: "Traceable Objects",
        kind: "group",
        parentId: "scene:root",
        depth: 1,
        sphereIndex: null,
        selectable: false,
        traceable: false,
        capability: "group",
      },
    ];
    const spheres: PtState["sceneObjects"] = this.renderer.ptScene
      .getSphereMeshes()
      .map((sphere) => {
      const sphereIndex = sphere.userData.pathTracer.primitiveIndex;
      return {
        id: sphere.userData.pathTracer.objectId,
        label: sphere.userData.pathTracer.objectName,
        kind: "sphere" as const,
        parentId: "group:traceables",
        depth: 2,
        sphereIndex,
        selectable: true,
        traceable: true,
        capability: "path traced",
      };
    });
    return [...fixedObjects, ...spheres];
  }

  private publishSceneObjects() {
    const sceneObjects = this.createSceneObjectState();
    this.store.update((state) => ({ ...state, sceneObjects }));
  }

  private captureTransform(object: PtSphereMesh): TransformSnapshot {
    return {
      position: object.position.clone(),
      scale: object.scale.clone(),
    };
  }

  private transformsEqual(a: TransformSnapshot, b: TransformSnapshot) {
    return a.position.equals(b.position) && a.scale.equals(b.scale);
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
    };
  }

  private applyMaterial(materialId: number, snapshot: MaterialSnapshot) {
    const material = this.renderer.ptScene.getMaterial(materialId);
    material.color.setHex(snapshot.color);
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
      getMaterialMetadata(this.selectedObject.material).materialId === materialId
    ) {
      this.publishSelection();
    }
  }

  private materialsEqual(a: MaterialSnapshot, b: MaterialSnapshot) {
    return (
      a.color === b.color && a.roughness === b.roughness && a.ior === b.ior
    );
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
    if (current.fov !== settings.fov) this.setFov(settings.fov);
    if (current.numSamples !== settings.numSamples) {
      this.setNumSamples(settings.numSamples);
    }
    if (current.maxRayDepth !== settings.maxRayDepth) {
      this.setMaxRayDepth(settings.maxRayDepth);
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
  }

  private settingsEqual(a: PtSettings, b: PtSettings) {
    return (Object.keys(a) as (keyof PtSettings)[]).every(
      (key) => a[key] === b[key]
    );
  }

  private emptySelection(): PtState["selection"] {
    return {
      objectId: null,
      sphereIndex: null,
      position: { x: -1, y: -1, z: -1 },
      radius: null,
      material: null,
    };
  }

  private publishHistory() {
    const history = this.history.getSnapshot();
    this.store.update((state) => ({ ...state, history }));
  }
}
