import * as THREE from "three";
import PtActions from "./PtActions";
import PtGui from "./PtGui";
import { PresetPtScenes } from "./PresetPtScenes";
import PtRenderer from "./PtRenderer";
import {
  getMaterialMetadata,
  isPtSphereMesh,
  type PtSphereMesh,
} from "./PtScene";
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

  private readonly pointerDownHandler = (event: PointerEvent) => {
    if (this.ui.contains(event.target as Node)) return;
    if (this.ptRenderer.transformControls.dragging) return;

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
    createUi: PtUiFactory = (actions) => new PtGui(actions)
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
      if (!this.selectedObject) {
        this.ui.hideSelection();
        return;
      }
      const { materialId, materialType } = getMaterialMetadata(
        this.selectedObject.material
      );
      this.ui.showSelection(
        this.selectedObject.material,
        materialId,
        materialType
      );
    });

    window.addEventListener("pointerdown", this.pointerDownHandler);
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
      this.ui.hideSelection();
      return;
    }

    this.selectedObject = object as PtSphereMesh;
    this.actions.selectObject(this.selectedObject);
  }
}
