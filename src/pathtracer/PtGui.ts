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
  private readonly apertureController: Controller;
  private readonly focusDistanceController: Controller;
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
    this.materialFolder.destroy();
    const label = materialLabels[materialType] ?? "Unknown";
    this.materialFolder = this.selectionFolder.addFolder(
      `Material - ${materialId} - ${label}`
    );

    this.materialFolder.addColor(material, "color").onChange(() => {
      this.actions.setMaterialColor(materialId, material.color);
    });

    if (material instanceof THREE.MeshStandardMaterial && materialType === 1) {
      this.materialFolder.add(material, "roughness", 0, 1).onChange(() => {
        this.actions.setMaterialFuzz(materialId, material.roughness);
      });
    }

    if (material instanceof THREE.MeshPhysicalMaterial && materialType === 2) {
      this.materialFolder.add(material, "ior", 0, 2.5).onChange(() => {
        this.actions.setMaterialIor(materialId, material.ior);
      });
    }

    this.selectionFolder.show();
  }

  public hideSelection() {
    if (this.disposed) return;
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
