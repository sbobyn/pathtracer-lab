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
import { isPtQuadMesh, isPtSphereMesh, type PtTraceableMesh } from "./PtScene";
import { createDefaultPtState } from "./PtState";
import PtStore from "./PtStore";
import type { PtUiAdapter, PtUiFactory } from "./PtUiAdapter";

export default class PtApp {
  private selectedObject: PtTraceableMesh | null = null;
  private readonly raycaster = new THREE.Raycaster();
  private readonly mouse = new THREE.Vector2();
  private intersectGroup: THREE.Group;
  private readonly ptRenderer: PtRenderer;
  private readonly actions: PtActions;
  private readonly ui: PtUiAdapter;
  private readonly unsubscribe: () => boolean;

  private readonly pointerDownHandler = (event: PointerEvent) => {
    if (event.button !== 0) return;
    if (this.ui.contains(event.target as Node)) return;
    if (this.ptRenderer.transformControls.dragging) return;
    if (this.ptRenderer.transformControls.axis) return;

    this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    this.selectAtPointer();
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
      const canceledSettings = this.actions.cancelSettingsEdit();
      if (canceledTransform || canceledMaterial || canceledSettings) {
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
    ptScene.backgroundColorTop.set(initialState.settings.backgroundColorTop);
    ptScene.backgroundColorBottom.set(initialState.settings.backgroundColorBottom);
    ptScene.scene.background = ptScene.backgroundColorTop;
    ptScene.dirLight.color = ptScene.backgroundColorTop;
    ptScene.camera.fov = initialState.settings.fov;
    ptScene.camera.updateProjectionMatrix();
    const store = new PtStore(initialState);

    this.ptRenderer = new PtRenderer(
      canvas,
      ptScene,
      { ...initialState.settings }
    );
    this.actions = new PtActions(store, this.ptRenderer, () => {
      clearPtPreferences(window.localStorage);
      window.location.reload();
    });
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
        : [...this.ptRenderer.ptScene.getSphereMeshes(), ...this.ptRenderer.ptScene.getQuadMeshes()]
            .find((object) => object.userData.pathTracer.objectId === currentObjectId) ?? null;
    });

    window.addEventListener("pointerdown", this.pointerDownHandler, true);
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
    this.ui.dispose();
    this.ptRenderer.dispose();
  }

  public disposeUi() {
    this.ui.dispose();
  }

  private selectAtPointer() {
    this.raycaster.setFromCamera(this.mouse, this.ptRenderer.camera);
    const [intersection] = this.raycaster.intersectObject(
      this.intersectGroup,
      true
    );
    const object = intersection?.object;

    if (!object || (!isPtSphereMesh(object) && !isPtQuadMesh(object))) {
      this.selectedObject = null;
      this.actions.selectObject(null);
      return;
    }

    const nextObject = object as PtTraceableMesh;
    if (nextObject === this.selectedObject) {
      this.selectedObject = null;
      this.actions.selectObject(null);
      return;
    }

    this.selectedObject = nextObject;
    this.actions.selectObject(nextObject);
  }
}
