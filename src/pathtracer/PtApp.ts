import * as THREE from "three";
import PtActions from "./PtActions";
import PtGui from "./PtGui";
import { PresetPtScenes } from "./PresetPtScenes";
import PtRenderer from "./PtRenderer";
import type { PtSphereMesh } from "./PtScene";
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
    this.unsubscribe = this.actions.subscribe((state) => {
      if (state.sceneKey === currentSceneKey) return;
      currentSceneKey = state.sceneKey;
      this.selectedObject = null;
      this.intersectGroup = this.ptRenderer.ptScene.intersectGroup;
      this.ui.hideSelection();
    });

    window.addEventListener("pointerdown", this.pointerDownHandler);
    this.ptRenderer.transformControls.addEventListener(
      "change",
      this.transformChangeHandler
    );
  }

  public dispose() {
    window.removeEventListener("pointerdown", this.pointerDownHandler);
    this.ptRenderer.transformControls.removeEventListener(
      "change",
      this.transformChangeHandler
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

    if (
      !(object instanceof THREE.Mesh) ||
      typeof object.userData.sphereIndex !== "number"
    ) {
      this.selectedObject = null;
      this.actions.selectObject(null);
      this.ui.hideSelection();
      return;
    }

    this.selectedObject = object as PtSphereMesh;
    const sphereIndex = this.selectedObject.userData.sphereIndex;
    const materialId = this.ptRenderer.ptScene.spheres[sphereIndex].materialId;
    const materialType = this.ptRenderer.ptScene.materials[materialId].type;

    this.actions.selectObject(this.selectedObject);
    this.ui.showSelection(
      this.selectedObject.material,
      materialId,
      materialType
    );
  }
}
