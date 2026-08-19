import * as THREE from "three";
import PtActions from "./PtActions";
import { PresetPtScenes } from "./PresetPtScenes";
import PtRenderer from "./PtRenderer";
import { isPtSphereMesh, type PtSphereMesh } from "./PtScene";
import { createDefaultPtState } from "./PtState";
import PtStore from "./PtStore";
import type { PtUiAdapter, PtUiFactory } from "./PtUiAdapter";

export default class PtApp {
  private selectedObject: PtSphereMesh | null = null;
  private readonly raycaster = new THREE.Raycaster();
  private readonly mouse = new THREE.Vector2();
  private intersectGroup: THREE.Group;
  private readonly ptRenderer: PtRenderer;
  private readonly actions: PtActions;
  private readonly ui: PtUiAdapter;
  private readonly unsubscribe: () => boolean;
  private rightPointerGesture: {
    x: number;
    y: number;
    moved: boolean;
  } | null = null;

  private readonly pointerDownHandler = (event: PointerEvent) => {
    if (this.ui.contains(event.target as Node)) return;
    if (this.ptRenderer.transformControls.dragging) return;

    if (event.button === 2) {
      this.rightPointerGesture = {
        x: event.clientX,
        y: event.clientY,
        moved: false,
      };
      return;
    }
    if (event.button !== 0) return;

    this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    this.selectAtPointer();
  };

  private readonly pointerMoveHandler = (event: PointerEvent) => {
    if (!this.rightPointerGesture) return;
    if (
      Math.hypot(
        event.clientX - this.rightPointerGesture.x,
        event.clientY - this.rightPointerGesture.y
      ) > 5
    ) {
      this.rightPointerGesture.moved = true;
    }
  };

  private readonly contextMenuHandler = (event: MouseEvent) => {
    if (this.ui.contains(event.target as Node)) return;

    const gesture = this.rightPointerGesture;
    this.rightPointerGesture = null;
    if (gesture?.moved || this.ptRenderer.transformControls.dragging) return;

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
    const ptScene = PresetPtScenes.Part1Simple();
    const initialState = createDefaultPtState();
    initialState.settings.fov = ptScene.camera.fov;
    const store = new PtStore(initialState);

    this.ptRenderer = new PtRenderer(
      canvas,
      ptScene,
      { ...initialState.settings }
    );
    this.actions = new PtActions(store, this.ptRenderer);
    this.intersectGroup = ptScene.intersectGroup;
    this.ui = createUi(this.actions);

    let currentSceneKey = initialState.sceneKey;
    let currentSphereIndex: number | null = null;
    this.unsubscribe = this.actions.subscribe((state) => {
      if (state.sceneKey !== currentSceneKey) {
        currentSceneKey = state.sceneKey;
        currentSphereIndex = null;
        this.selectedObject = null;
        this.intersectGroup = this.ptRenderer.ptScene.intersectGroup;
      }

      if (state.selection.sphereIndex === currentSphereIndex) return;
      currentSphereIndex = state.selection.sphereIndex;
      this.selectedObject =
        currentSphereIndex === null
          ? null
          : this.ptRenderer.ptScene.getSphereMeshes()[currentSphereIndex] ??
            null;
    });

    window.addEventListener("pointerdown", this.pointerDownHandler);
    window.addEventListener("pointermove", this.pointerMoveHandler);
    window.addEventListener("contextmenu", this.contextMenuHandler);
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
    window.removeEventListener("pointerdown", this.pointerDownHandler);
    window.removeEventListener("pointermove", this.pointerMoveHandler);
    window.removeEventListener("contextmenu", this.contextMenuHandler);
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

    if (!object || !isPtSphereMesh(object)) {
      this.selectedObject = null;
      this.actions.selectObject(null);
      return;
    }

    this.selectedObject = object as PtSphereMesh;
    this.actions.selectObject(this.selectedObject);
  }
}
