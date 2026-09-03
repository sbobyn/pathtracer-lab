import * as THREE from "three";
import PtActions from "./PtActions";
import { PresetPtScenes, resolutionScaleForPreset } from "./PresetPtScenes";
import PtRenderer from "./PtRenderer";
import {
  clearPtPreferences,
  loadPtPreferences,
  preferenceSnapshot,
  savePtPreferences,
} from "./PtPreferences";
import { isPtBoxMesh, isPtQuadMesh, isPtSphereMesh, isPtTriangleMesh, type PtEditableObject } from "./PtScene";
import { analyticLightNodeFromObject } from "./PtAnalyticLight";
import { createDefaultPtState } from "./PtState";
import PtStore from "./PtStore";
import type { PtUiAdapter, PtUiFactory } from "./PtUiAdapter";
import AdaptiveQualityRuntime from "./AdaptiveQualityRuntime";

export default class PtApp {
  private selectedObject: PtEditableObject | null = null;
  private readonly raycaster = new THREE.Raycaster();
  private readonly mouse = new THREE.Vector2();
  private selectionPointer: { pointerId: number; startX: number; startY: number; moved: boolean } | null = null;
  private intersectGroup: THREE.Group;
  private readonly ptRenderer: PtRenderer;
  private readonly actions: PtActions;
  private readonly ui: PtUiAdapter;
  private readonly unsubscribe: () => boolean;
  private readonly adaptiveQuality: AdaptiveQualityRuntime;

  private readonly pointerDownHandler = (event: PointerEvent) => {
    if (event.button !== 0) return;
    if (this.ui.contains(event.target as Node)) return;
    if (this.ptRenderer.transformControls.dragging) return;
    if (this.ptRenderer.transformControls.axis) return;
    this.selectionPointer = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
    };
  };

  private readonly pointerMoveHandler = (event: PointerEvent) => {
    const gesture = this.selectionPointer;
    if (!gesture || gesture.pointerId !== event.pointerId || gesture.moved) return;
    gesture.moved = Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY) > 4;
  };

  private readonly pointerUpHandler = (event: PointerEvent) => {
    const gesture = this.selectionPointer;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    this.selectionPointer = null;
    if (gesture.moved || this.ui.contains(event.target as Node)) return;
    this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    if (this.actions.getState().bvhTraversal.armed) {
      this.actions.inspectBvhTraversalAtNdc(this.mouse.x, this.mouse.y);
      return;
    }
    this.selectAtPointer(
      event.metaKey ? "remove" : event.shiftKey ? "add" : "replace"
    );
  };

  private readonly pointerCancelHandler = (event: PointerEvent) => {
    if (this.selectionPointer?.pointerId === event.pointerId) this.selectionPointer = null;
  };

  private readonly transformChangeHandler = () => {
    if (this.selectedObject) this.actions.syncSelectedTransform();
  };

  private readonly draggingChangedHandler = (event: { value: unknown }) => {
    if (event.value) this.actions.beginSelectedTransform();
    else this.actions.commitSelectedTransform();
  };

  private readonly keyDownHandler = (event: KeyboardEvent) => {
    const target = event.target;
    const editingText =
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement ||
      (target instanceof HTMLElement && target.isContentEditable);
    if (!editingText && !event.metaKey && !event.ctrlKey && !event.altKey) {
      const key = event.key.toLowerCase();
      const mode = key === "g" ? "translate" : key === "r" ? "rotate" : key === "s" ? "scale" : null;
      if (mode) {
        this.actions.setTransformMode(mode);
        event.preventDefault();
        return;
      }
    }
    if (!editingText && event.shiftKey && event.key.toLowerCase() === "a") {
      this.actions.addSphere();
      event.preventDefault();
      return;
    }
    if (!editingText && event.shiftKey && event.key.toLowerCase() === "d") {
      if (this.actions.duplicateSelectedObject()) event.preventDefault();
      return;
    }
    if (!editingText && event.key.toLowerCase() === "f") {
      if (this.actions.frameSelectedObject()) event.preventDefault();
      return;
    }
    if (
      !editingText &&
      (event.key === "Delete" ||
        event.key === "Backspace" ||
        event.key.toLowerCase() === "x")
    ) {
      if (this.actions.removeSelectedObject()) event.preventDefault();
      return;
    }
    if (event.key === "Escape") {
      const canceledTransform = this.actions.cancelSelectedTransform();
      const canceledMaterial = this.actions.cancelMaterialEdit();
      const canceledLight = this.actions.cancelSelectedLightEdit();
      const canceledSettings = this.actions.cancelSettingsEdit();
      if (canceledTransform || canceledMaterial || canceledLight || canceledSettings) {
        event.preventDefault();
      }
      return;
    }

    if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
    if (event.key.toLowerCase() !== "z") return;
    const changed = event.shiftKey ? this.actions.redo() : this.actions.undo();
    if (changed) event.preventDefault();
  };

  constructor(
    canvas: HTMLCanvasElement,
    createUi: PtUiFactory
  ) {
    const defaults = createDefaultPtState();
    const loadedState = loadPtPreferences(
      window.localStorage,
      defaults,
      Object.keys(PresetPtScenes)
    );
    const initialState = {
      ...loadedState,
      settings: {
        ...loadedState.settings,
        resolutionScale: resolutionScaleForPreset(
          loadedState.sceneKey,
          loadedState.settings.resolutionScale
        ),
      },
    };
    const ptScene = PresetPtScenes[initialState.sceneKey]();
    // Environment presets own their loading fallback. Do not replace that
    // fallback with globally persisted gradient colors during startup, or an
    // HDR scene can briefly flash another scene's blue/white sky on refresh.
    if (ptScene.environmentSource) {
      initialState.settings.backgroundColorTop =
        `#${ptScene.backgroundColorTop.getHexString()}`;
      initialState.settings.backgroundColorBottom =
        `#${ptScene.backgroundColorBottom.getHexString()}`;
    } else {
      ptScene.backgroundColorTop.set(initialState.settings.backgroundColorTop);
      ptScene.backgroundColorBottom.set(initialState.settings.backgroundColorBottom);
    }
    ptScene.scene.background = ptScene.backgroundColorTop;
    ptScene.dirLight.color.copy(
      ptScene.environmentSource ? new THREE.Color(0xffffff) : ptScene.backgroundColorTop
    );
    if (initialState.settings.environmentMode === "map" && initialState.settings.environmentSource) {
      ptScene.setEnvironmentMap(
        initialState.settings.environmentSource,
        initialState.settings.environmentLabel
      );
    }
    ptScene.camera.fov = initialState.settings.fov;
    ptScene.camera.updateProjectionMatrix();
    const store = new PtStore(initialState);

    this.ptRenderer = new PtRenderer(
      canvas,
      ptScene,
      { ...initialState.settings }
    );
    this.ptRenderer.setOrthographicHeight(initialState.settings.orthographicHeight, false);
    this.ptRenderer.setCameraProjectionMode(initialState.settings.cameraProjectionMode, false);
    this.actions = new PtActions(store, this.ptRenderer, () => {
      clearPtPreferences(window.localStorage);
      window.location.reload();
    });
    this.adaptiveQuality = new AdaptiveQualityRuntime(this.actions, window.localStorage);
    this.intersectGroup = ptScene.intersectGroup;
    this.ui = createUi(this.actions);

    let currentSceneKey = initialState.sceneKey;
    let currentObjectId: string | null = null;
    let currentPreferences = JSON.stringify(preferenceSnapshot(initialState));
    this.unsubscribe = this.actions.subscribe((state) => {
      const nextPreferences = JSON.stringify(preferenceSnapshot(state));
      if (nextPreferences !== currentPreferences) {
        currentPreferences = nextPreferences;
        try {
          savePtPreferences(window.localStorage, state);
        } catch {
          // Storage can be unavailable or full; rendering should continue.
        }
      }
      if (state.sceneKey !== currentSceneKey) {
        currentSceneKey = state.sceneKey;
        currentObjectId = null;
        this.selectedObject = null;
        this.intersectGroup = this.ptRenderer.ptScene.intersectGroup;
      }

      if (state.selection.objectId === currentObjectId) return;
      currentObjectId = state.selection.objectId;
      this.selectedObject = currentObjectId === null
        ? null
        : [
            ...this.ptRenderer.ptScene.getSphereMeshes(),
            ...this.ptRenderer.ptScene.getQuadMeshes(),
            ...this.ptRenderer.ptScene.getBoxMeshes(),
            ...this.ptRenderer.ptScene.getAnalyticLightNodes(),
            ...this.ptRenderer.ptScene.getTriangleMeshes(),
          ]
            .find((object) => object.userData.pathTracer.objectId === currentObjectId) ?? null;
    });

    window.addEventListener("pointerdown", this.pointerDownHandler, true);
    window.addEventListener("pointermove", this.pointerMoveHandler, true);
    window.addEventListener("pointerup", this.pointerUpHandler, true);
    window.addEventListener("pointercancel", this.pointerCancelHandler, true);
    window.addEventListener("keydown", this.keyDownHandler);
    this.ptRenderer.transformControls.addEventListener(
      "change",
      this.transformChangeHandler
    );
    this.ptRenderer.transformControls.addEventListener(
      "dragging-changed",
      this.draggingChangedHandler
    );
  }

  public dispose() {
    window.removeEventListener("pointerdown", this.pointerDownHandler, true);
    window.removeEventListener("pointermove", this.pointerMoveHandler, true);
    window.removeEventListener("pointerup", this.pointerUpHandler, true);
    window.removeEventListener("pointercancel", this.pointerCancelHandler, true);
    window.removeEventListener("keydown", this.keyDownHandler);
    this.ptRenderer.transformControls.removeEventListener(
      "change",
      this.transformChangeHandler
    );
    this.ptRenderer.transformControls.removeEventListener(
      "dragging-changed",
      this.draggingChangedHandler
    );
    this.unsubscribe();
    this.actions.dispose();
    this.adaptiveQuality.dispose();
    this.ui.dispose();
    this.ptRenderer.dispose();
  }

  public disposeUi() {
    this.ui.dispose();
  }

  private selectAtPointer(mode: "replace" | "add" | "remove") {
    this.raycaster.setFromCamera(this.mouse, this.ptRenderer.camera);
    const [intersection] = this.raycaster.intersectObjects(
      [this.intersectGroup, this.ptRenderer.ptScene.analyticLightGroup, this.ptRenderer.ptScene.triangleMeshGroup],
      true
    );
    const object = intersection?.object;
    const analyticLight = analyticLightNodeFromObject(object ?? null);

    if (!object || (!isPtSphereMesh(object) && !isPtQuadMesh(object) && !isPtBoxMesh(object) && !isPtTriangleMesh(object) && !analyticLight)) {
      if (mode === "replace") {
        this.selectedObject = null;
        this.actions.selectObject(null);
      }
      return;
    }

    const nextObject: PtEditableObject = analyticLight ?? object as PtEditableObject;
    if (mode === "replace" && nextObject === this.selectedObject) {
      this.selectedObject = null;
      this.actions.selectObject(null);
      return;
    }

    this.selectedObject = this.actions.selectObject(nextObject, mode);
  }
}
