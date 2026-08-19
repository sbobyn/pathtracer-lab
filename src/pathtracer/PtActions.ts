import * as THREE from "three";
import { PresetPtScenes } from "./PresetPtScenes";
import PtRenderer from "./PtRenderer";
import { sphereRadius, type PtSphereMesh } from "./PtScene";
import PtStore from "./PtStore";
import type { PtStateListener } from "./PtStore";
import type {
  AccumulationFormat,
  PtSettings,
  PtState,
  TransformMode,
} from "./PtState";
import { PtInvalidationLevel } from "./PtInvalidation";

export default class PtActions {
  private selectedObject: PtSphereMesh | null = null;

  constructor(
    private readonly store: PtStore,
    private readonly renderer: PtRenderer
  ) {}

  public getState() {
    return this.store.getState();
  }

  public subscribe(listener: PtStateListener) {
    return this.store.subscribe(listener);
  }

  public getInvalidationHistory() {
    return this.renderer.getInvalidationHistory();
  }

  public setScene(sceneKey: string) {
    const createScene = PresetPtScenes[sceneKey];
    if (!createScene) throw new RangeError(`Unknown scene preset: ${sceneKey}`);

    const scene = createScene();
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
    }));
    Object.assign(this.renderer.settings, this.store.getState().settings);
    this.renderer.invalidate(PtInvalidationLevel.Scene, "scene preset replaced");
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

  public setTransformMode(mode: TransformMode) {
    this.renderer.transformControls.mode = mode;
    const scaling = mode === "scale";
    this.renderer.transformControls.showY = !scaling;
    this.renderer.transformControls.showZ = !scaling;
    this.updateSetting("transformMode", mode);
  }

  public selectObject(object: PtSphereMesh | null) {
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

  public setSelectedPosition(axis: "x" | "y" | "z", value: number) {
    if (!this.selectedObject) return;
    this.selectedObject.position[axis] = value;
    this.renderer.invalidate(
      PtInvalidationLevel.Geometry,
      `sphere ${this.selectedObject.userData.pathTracer.primitiveIndex} position changed`
    );
    this.publishSelection();
  }

  public setSelectedRadius(radius: number) {
    if (!this.selectedObject) return;
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

  public setMaterialColor(materialId: number, color: THREE.Color) {
    this.renderer.ptScene.getMaterial(materialId).color.copy(color);
    this.renderer.invalidate(
      PtInvalidationLevel.Material,
      `material ${materialId} color changed`
    );
  }

  public setMaterialFuzz(materialId: number, fuzz: number) {
    const material = this.renderer.ptScene.getMaterial(materialId);
    if (material instanceof THREE.MeshStandardMaterial) {
      material.roughness = fuzz;
    }
    this.renderer.invalidate(
      PtInvalidationLevel.Material,
      `material ${materialId} fuzz changed`
    );
  }

  public setMaterialIor(materialId: number, ior: number) {
    const material = this.renderer.ptScene.getMaterial(materialId);
    if (material instanceof THREE.MeshPhysicalMaterial) material.ior = ior;
    this.renderer.invalidate(
      PtInvalidationLevel.Material,
      `material ${materialId} index of refraction changed`
    );
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
    const sphereIndex = this.selectedObject.userData.pathTracer.primitiveIndex;
    const { x, y, z } = this.selectedObject.position;
    const radius = sphereRadius(this.selectedObject);
    this.store.update((state) => ({
      ...state,
      selection: { sphereIndex, position: { x, y, z }, radius },
    }));
  }

  private emptySelection(): PtState["selection"] {
    return {
      sphereIndex: null,
      position: { x: -1, y: -1, z: -1 },
      radius: null,
    };
  }
}
