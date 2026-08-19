import * as THREE from "three";
import { GUI, type Controller } from "lil-gui";
import PtActions from "./PtActions";
import { PresetPtScenes } from "./PresetPtScenes";
import type { PtPreviewMaterial } from "./PtScene";
import type { PtSettings, TransformMode } from "./PtState";
import type { PtUiAdapter } from "./PtUiAdapter";

const materialLabels: Record<number, string> = {
  0: "Lambert",
  1: "Metal",
  2: "Dielectric",
};

type GuiModel = PtSettings & {
  sceneKey: string;
  selectedPosition: { x: number; y: number; z: number };
  selectedRadius: number;
};

export default class PtGui implements PtUiAdapter {
  private readonly gui = new GUI({ title: "Settings" });
  private readonly model: GuiModel;
  private readonly controllers: Controller[] = [];
  private readonly raytracingFolder: GUI;
  private readonly selectionFolder: GUI;
  private materialFolder: GUI;
  private selectedMaterial: PtPreviewMaterial | null = null;
  private materialModel: {
    color: string;
    roughness: number;
    ior: number;
  } | null = null;
  private materialControllers: Controller[] = [];
  private readonly apertureController: Controller;
  private readonly focusDistanceController: Controller;
  private readonly undoController: Controller;
  private readonly redoController: Controller;
  private readonly unsubscribe: () => boolean;
  private disposed = false;

  constructor(private readonly actions: PtActions) {
    const state = actions.getState();
    this.model = {
      ...state.settings,
      sceneKey: state.sceneKey,
      selectedPosition: { ...state.selection.position },
      selectedRadius: state.selection.radius ?? 0,
    };

    this.controllers.push(
      this.gui
        .add(this.model, "sceneKey", Object.keys(PresetPtScenes))
        .name("Scene")
        .onChange((sceneKey: string) => actions.setScene(sceneKey)),
      this.gui
        .add(this.model, "pathtracingEnabled")
        .onChange((enabled: boolean) => actions.setPathtracingEnabled(enabled)),
      this.gui
        .addColor(this.model, "backgroundColorTop")
        .onChange((color: THREE.ColorRepresentation) =>
          actions.setBackgroundColorTop(color)
        ),
      this.gui
        .addColor(this.model, "backgroundColorBottom")
        .onChange((color: THREE.ColorRepresentation) =>
          actions.setBackgroundColorBottom(color)
        ),
      this.gui
        .add(this.model, "fov", 10, 120, 1)
        .onChange((fov: number) => actions.setFov(fov))
    );

    const historyCommands = {
      undo: () => actions.undo(),
      redo: () => actions.redo(),
    };
    this.undoController = this.gui.add(historyCommands, "undo").name("Undo");
    this.redoController = this.gui.add(historyCommands, "redo").name("Redo");
    this.controllers.push(this.undoController, this.redoController);

    this.raytracingFolder = this.gui.addFolder("Raytracing Settings");
    this.controllers.push(
      this.raytracingFolder
        .add(this.model, "numSamples", 1, 20, 1)
        .name("Samples")
        .onChange((samples: number) => actions.setNumSamples(samples)),
      this.raytracingFolder
        .add(this.model, "maxRayDepth", 1, 20, 1)
        .name("Max Ray Depth")
        .onChange((depth: number) => actions.setMaxRayDepth(depth)),
      this.raytracingFolder
        .add(this.model, "resolutionScale", [
          2.0, 1.0, 0.5, 0.25, 0.125, 0.0625,
        ])
        .onChange((scale: number) => actions.setResolutionScale(scale)),
      this.raytracingFolder
        .add(this.model, "accumulationFormat", [
          "rgba32f",
          "rgba16f",
          "rgba8",
        ])
        .name("Accumulation Format")
        .onChange(() =>
          actions.setAccumulationFormat(this.model.accumulationFormat)
        ),
      this.raytracingFolder
        .add(this.model, "maxAccumulationFrames", 0, 100_000, 1)
        .name("Max Accumulation Frames")
        .onChange((frames: number) =>
          actions.setMaxAccumulationFrames(frames)
        ),
      this.raytracingFolder
        .add(this.model, "enableDepthOfField")
        .onChange((enabled: boolean) =>
          actions.setDepthOfFieldEnabled(enabled)
        )
    );

    this.apertureController = this.raytracingFolder
      .add(this.model, "aperture", 0, 0.1, 0.001)
      .onChange((aperture: number) => actions.setAperture(aperture));
    this.focusDistanceController = this.raytracingFolder
      .add(this.model, "focusDistance", 0.1, 20, 0.1)
      .onChange((distance: number) => actions.setFocusDistance(distance));
    this.controllers.push(
      this.apertureController,
      this.focusDistanceController
    );

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
    this.selectionFolder.hide();
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
    this.selectionFolder.hide();
  }

  public dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.unsubscribe();
    this.gui.destroy();
  }

  private sync(state: ReturnType<PtActions["getState"]>) {
    if (this.disposed) return;
    Object.assign(this.model, state.settings, { sceneKey: state.sceneKey });
    Object.assign(this.model.selectedPosition, state.selection.position);
    this.model.selectedRadius = state.selection.radius ?? 0;
    this.controllers.forEach((controller) => controller.updateDisplay());
    this.undoController
      .name(state.history.undoLabel ? `Undo: ${state.history.undoLabel}` : "Undo")
      .enable(state.history.canUndo);
    this.redoController
      .name(state.history.redoLabel ? `Redo: ${state.history.redoLabel}` : "Redo")
      .enable(state.history.canRedo);
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

    if (state.settings.pathtracingEnabled) this.raytracingFolder.show();
    else this.raytracingFolder.hide();

    if (state.settings.enableDepthOfField) {
      this.apertureController.enable();
      this.focusDistanceController.enable();
    } else {
      this.apertureController.disable();
      this.focusDistanceController.disable();
    }

    if (state.selection.sphereIndex === null) this.selectionFolder.hide();
  }
}
