import * as THREE from "three";
import { GUI, type Controller } from "lil-gui";
import PtActions from "./PtActions";
import type { PtPreviewMaterial } from "./PtScene";
import type { TransformMode } from "./PtState";
import type { PtUiAdapter } from "./PtUiAdapter";

const materialLabels: Record<number, string> = {
  0: "Lambert",
  1: "Metal",
  2: "Dielectric",
};

type GuiModel = {
  transformMode: TransformMode;
  selectedPosition: { x: number; y: number; z: number };
  selectedRadius: number;
};

export default class PtGui implements PtUiAdapter {
  private readonly gui = new GUI({ title: "Selected Object" });
  private readonly model: GuiModel;
  private readonly controllers: Controller[] = [];
  private readonly selectionFolder: GUI;
  private materialFolder: GUI;
  private selectedMaterial: PtPreviewMaterial | null = null;
  private materialModel: {
    color: string;
    roughness: number;
    ior: number;
  } | null = null;
  private materialControllers: Controller[] = [];
  private readonly unsubscribe: () => boolean;
  private disposed = false;

  constructor(private readonly actions: PtActions) {
    const state = actions.getState();
    this.model = {
      transformMode: state.settings.transformMode,
      selectedPosition: { ...state.selection.position },
      selectedRadius: state.selection.radius ?? 0,
    };

    this.selectionFolder = this.gui.addFolder("Selected Object");
    this.controllers.push(
      this.selectionFolder
        .add(this.model, "transformMode", ["translate", "scale"])
        .name("transform mode")
        .onChange((mode: TransformMode) => actions.setTransformMode(mode)),
      this.selectionFolder
        .add(this.model.selectedPosition, "x", -1)
        .onChange((value: number) => actions.setSelectedPosition("x", value))
        .onFinishChange(() => actions.commitSelectedTransform()),
      this.selectionFolder
        .add(this.model.selectedPosition, "y", -1)
        .onChange((value: number) => actions.setSelectedPosition("y", value))
        .onFinishChange(() => actions.commitSelectedTransform()),
      this.selectionFolder
        .add(this.model.selectedPosition, "z", -1)
        .onChange((value: number) => actions.setSelectedPosition("z", value))
        .onFinishChange(() => actions.commitSelectedTransform()),
      this.selectionFolder
        .add(this.model, "selectedRadius", 0)
        .name("radius")
        .onChange((radius: number) => actions.setSelectedRadius(radius))
        .onFinishChange(() => actions.commitSelectedTransform())
    );

    const objectCommands = {
      duplicate: () => actions.duplicateSelectedObject(),
      remove: () => actions.removeSelectedObject(),
    };
    this.controllers.push(
      this.selectionFolder.add(objectCommands, "duplicate").name("Duplicate"),
      this.selectionFolder.add(objectCommands, "remove").name("Remove")
    );

    this.materialFolder = this.selectionFolder.addFolder("Material");
    this.gui.hide();
    this.sync(state);
    this.unsubscribe = actions.subscribe((nextState) => this.sync(nextState));
  }

  public contains(target: Node) {
    return !this.disposed && this.gui.domElement.contains(target);
  }

  public showSelection(
    material: PtPreviewMaterial,
    materialId: number,
    materialType: number
  ) {
    if (this.disposed) return;
    this.gui.show();
    this.selectedMaterial = material;
    this.materialFolder.destroy();
    this.materialControllers = [];
    const label = materialLabels[materialType] ?? "Unknown";
    this.materialFolder = this.selectionFolder.addFolder(
      `Material - ${materialId} - ${label}`
    );

    const materialModel = (this.materialModel = {
      color: `#${material.color.getHexString()}`,
      roughness:
        material instanceof THREE.MeshStandardMaterial
          ? material.roughness
          : 0,
      ior: material instanceof THREE.MeshPhysicalMaterial ? material.ior : 1,
    });

    this.materialControllers.push(this.materialFolder
      .addColor(materialModel, "color")
      .onChange((color: THREE.ColorRepresentation) => {
        this.actions.setMaterialColor(materialId, new THREE.Color(color));
      })
      .onFinishChange(() => this.actions.commitMaterialEdit()));

    if (material instanceof THREE.MeshStandardMaterial && materialType === 1) {
      this.materialControllers.push(this.materialFolder
        .add(materialModel, "roughness", 0, 1)
        .onChange((roughness: number) => {
          this.actions.setMaterialFuzz(materialId, roughness);
        })
        .onFinishChange(() => this.actions.commitMaterialEdit()));
    }

    if (material instanceof THREE.MeshPhysicalMaterial && materialType === 2) {
      this.materialControllers.push(this.materialFolder
        .add(materialModel, "ior", 0, 2.5)
        .onChange((ior: number) => {
          this.actions.setMaterialIor(materialId, ior);
        })
        .onFinishChange(() => this.actions.commitMaterialEdit()));
    }

    this.selectionFolder.show();
  }

  public hideSelection() {
    if (this.disposed) return;
    this.selectedMaterial = null;
    this.materialModel = null;
    this.materialControllers = [];
    this.gui.hide();
  }

  public dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.unsubscribe();
    this.gui.destroy();
  }

  private sync(state: ReturnType<PtActions["getState"]>) {
    if (this.disposed) return;
    this.model.transformMode = state.settings.transformMode;
    Object.assign(this.model.selectedPosition, state.selection.position);
    this.model.selectedRadius = state.selection.radius ?? 0;
    this.controllers.forEach((controller) => controller.updateDisplay());
    if (this.selectedMaterial && this.materialModel) {
      this.materialModel.color = `#${this.selectedMaterial.color.getHexString()}`;
      if (this.selectedMaterial instanceof THREE.MeshStandardMaterial) {
        this.materialModel.roughness = this.selectedMaterial.roughness;
      }
      if (this.selectedMaterial instanceof THREE.MeshPhysicalMaterial) {
        this.materialModel.ior = this.selectedMaterial.ior;
      }
      this.materialControllers.forEach((controller) =>
        controller.updateDisplay()
      );
    }

    if (state.selection.sphereIndex === null) this.gui.hide();
  }
}
