import * as THREE from "three";
import { GUI, Controller } from "lil-gui";
import PtRenderer from "./PtRenderer";
import PtScene, {
  type PtPreviewMaterial,
  type PtSphereMesh,
} from "./PtScene";
import { PresetPtScenes } from "./PresetPtScenes";
import PtActions from "./PtActions";
import { createDefaultPtState } from "./PtState";
import PtStore from "./PtStore";

const materialLabelDict = {
  0: "Lambert",
  1: "Metal",
  2: "Dielectric",
};

export default class PtApp {
  private selectedObject: PtSphereMesh | null;
  private selectedPosition: THREE.Vector3;
  public selectedRadius: number;

  private raycaster: THREE.Raycaster;
  private mouse: THREE.Vector2;
  private intersectGroup: THREE.Group;

  private gui: GUI;

  private materialFolder: GUI;
  private selctedObjectFolder: GUI;
  private selectedRadiusGui: Controller;
  private backgroundColorTopGui: Controller;
  private backgroundColorBottomGui: Controller;
  private fovGui: Controller;
  private toggleDoFGui: Controller;
  private transformControlGui: Controller;
  private numSamplesGui: Controller;

  private activePtScene: PtScene;
  private readonly ptRenderer: PtRenderer;
  private readonly actions: PtActions;
  private readonly pointerDownHandler: (event: PointerEvent) => void;
  private readonly transformChangeHandler: () => void;

  constructor(canvas: HTMLCanvasElement) {
    const ptScene = PresetPtScenes.Part1Simple();
    const initialState = createDefaultPtState();
    initialState.settings.fov = ptScene.camera.fov;
    const settings = { ...initialState.settings };
    const store = new PtStore(initialState);

    const ptRenderer = new PtRenderer(canvas, ptScene, settings);
    this.ptRenderer = ptRenderer;
    this.actions = new PtActions(store, ptRenderer);

    this.selectedObject = null;
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.intersectGroup = ptScene.intersectGroup;
    this.selectedPosition = new THREE.Vector3(-1, -1, -1);
    this.selectedRadius = -1;

    this.activePtScene = ptScene;

    this.gui = new GUI({ title: "Settings" });

    const currentSceneName = { value: "Part1Simple" };

    this.gui
      .add(currentSceneName, "value", Object.keys(PresetPtScenes))
      .name("Scene")
      .onChange((sceneKey: string) => {
        this.actions.setScene(sceneKey);
        const newScene = ptRenderer.ptScene;

        // reset GUI state
        this.intersectGroup = newScene.intersectGroup;
        this.selctedObjectFolder.hide();
        Object.assign(settings, this.actions.getState().settings);
        this.backgroundColorTopGui.updateDisplay();
        this.backgroundColorBottomGui.updateDisplay();
        this.fovGui.updateDisplay();
        this.toggleDoFGui.updateDisplay();
        this.transformControlGui.updateDisplay();
        this.numSamplesGui.updateDisplay();
        apertureGUI.disable();
        focusDistGUI.disable();

        this.activePtScene = newScene;
      });

    const raytracingToggleGUI = this.gui
      .add(settings, "pathtracingEnabled")
      .onChange((value: boolean) => this.actions.setPathtracingEnabled(value));
    this.backgroundColorTopGui = this.gui
      .addColor(settings, "backgroundColorTop")
      .onChange((value: string | number | THREE.Color) => {
        this.actions.setBackgroundColorTop(value);
      });

    this.backgroundColorBottomGui = this.gui
      .addColor(settings, "backgroundColorBottom")
      .onChange((value: string | number | THREE.Color) => {
        this.actions.setBackgroundColorBottom(value);
      });

    this.fovGui = this.gui
      .add(settings, "fov", 10, 120, 1)
      .onChange((value: number) => this.actions.setFov(value));

    const raytracingSettingsFolder = this.gui.addFolder("Raytracing Settings");
    if (!settings.pathtracingEnabled) {
      raytracingSettingsFolder.hide();
    }

    this.numSamplesGui = raytracingSettingsFolder
      .add(settings, "numSamples", 1, 20, 1)
      .onChange((value: number) => this.actions.setNumSamples(value))
      .name("Samples");

    raytracingSettingsFolder
      .add(settings, "maxRayDepth", 1, 20, 1)
      .onChange((value: number) => this.actions.setMaxRayDepth(value))
      .name("Max Ray Depth");

    raytracingSettingsFolder
      .add(settings, "resolutionScale", [2.0, 1.0, 0.5, 0.25, 0.125, 0.0625])
      .onChange((value: number) => {
        this.actions.setResolutionScale(value);
      });

    raytracingSettingsFolder
      .add(settings, "accumulationFormat", ["rgba32f", "rgba16f", "rgba8"])
      .onChange(() => {
        this.actions.setAccumulationFormat(settings.accumulationFormat);
      })
      .name("Accumulation Format");

    raytracingSettingsFolder
      .add(settings, "maxAccumulationFrames", 0, 100_000, 1)
      .onChange((value: number) => {
        this.actions.setMaxAccumulationFrames(value);
      })
      .name("Max Accumulation Frames");

    raytracingToggleGUI.onChange((value: boolean) => {
      if (value) {
        raytracingSettingsFolder.show();
      } else {
        raytracingSettingsFolder.hide();
      }
    });

    this.toggleDoFGui = raytracingSettingsFolder.add(
      settings,
      "enableDepthOfField"
    );
    const apertureGUI = raytracingSettingsFolder
      .add(settings, "aperture", 0, 0.1, 0.001)
      .onChange((value: number) => {
        this.actions.setAperture(value);
      });
    if (!settings.enableDepthOfField) apertureGUI.disable();
    const focusDistGUI = raytracingSettingsFolder
      .add(settings, "focusDistance", 0.1, 20, 0.1)
      .onChange((value: number) => {
        this.actions.setFocusDistance(value);
      });
    if (!settings.enableDepthOfField) focusDistGUI.disable();
    this.toggleDoFGui.onChange((value: boolean) => {
      this.actions.setDepthOfFieldEnabled(value);
      if (value) {
        apertureGUI.enable();
        focusDistGUI.enable();
      } else {
        apertureGUI.disable();
        focusDistGUI.disable();
      }
    });

    this.selctedObjectFolder = this.gui.addFolder("Selected Object");

    this.transformControlGui = this.selctedObjectFolder
      .add(settings, "transformMode", ["translate", "scale"])
      .name("transform mode")
      .onChange((value: string) => {
        this.actions.setTransformMode(value as "translate" | "scale");
      });

    const selectedPositionXGUI = this.selctedObjectFolder
      .add(this.selectedPosition, "x", -1)
      .onChange((value: number) => {
        this.actions.setSelectedPosition("x", value);
      });
    const selectedPositionYGUI = this.selctedObjectFolder
      .add(this.selectedPosition, "y", -1)
      .onChange((value: number) => {
        this.actions.setSelectedPosition("y", value);
      });
    const selectedPositionZGUI = this.selctedObjectFolder
      .add(this.selectedPosition, "z", -1)
      .onChange((value: number) => {
        this.actions.setSelectedPosition("z", value);
      });
    this.selectedRadiusGui = this.selctedObjectFolder
      .add(this, "selectedRadius", 0)
      .onChange((value: number) => {
        this.actions.setSelectedRadius(value);
      })
      .name("radius");

    this.materialFolder = this.selctedObjectFolder.addFolder("Material");

    this.selctedObjectFolder.hide();

    // on this.mouse down check for intersection
    this.pointerDownHandler = (e) => {
      if (this.gui.domElement.contains(e.target as Node)) return;
      if (ptRenderer.transformControls.dragging) return;

      this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
      this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
      this.checkIntersection(ptRenderer);
    };
    window.addEventListener("pointerdown", this.pointerDownHandler);

    this.actions.setTransformMode("translate");

    this.transformChangeHandler = () => {
      if (!this.selectedObject) {
        return;
      }

      if (ptRenderer.transformControls.mode === "scale") {
        this.actions.syncSelectedTransform();
        const sphereIndex = this.selectedObject.userData.sphereIndex;
        this.selectedRadius = this.activePtScene.spheres[sphereIndex].radius;
        this.selectedRadiusGui.updateDisplay();
      } else {
        this.actions.syncSelectedTransform();
        this.selectedPosition.copy(this.selectedObject.position);
        selectedPositionXGUI.updateDisplay();
        selectedPositionYGUI.updateDisplay();
        selectedPositionZGUI.updateDisplay();
      }
    };
    ptRenderer.transformControls.addEventListener(
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
    this.gui.destroy();
    this.ptRenderer.dispose();
  }

  checkIntersection(ptRenderer: PtRenderer) {
    this.raycaster.setFromCamera(this.mouse, ptRenderer.camera);

    const intersects = this.raycaster.intersectObject(
      this.intersectGroup,
      true
    );

    if (intersects.length > 0) {
      const object = intersects[0].object;
      if (
        !(object instanceof THREE.Mesh) ||
        typeof object.userData.sphereIndex !== "number"
      ) {
        return;
      }
      this.selectedObject = object as PtSphereMesh;
      const sphereIndex = this.selectedObject.userData.sphereIndex;

      this.actions.selectObject(this.selectedObject);
      this.selctedObjectFolder.show();
      // radius display must be manually updated

      this.selectedRadius =
        this.activePtScene.spheres[sphereIndex].radius;
      this.selectedRadiusGui.updateDisplay();
      this.populateMaterialGUI(
        this.selectedObject.material,
        this.activePtScene.spheres[sphereIndex].materialId
      );
    } else {
      this.selectedObject = null;
      this.actions.selectObject(null);
      this.selctedObjectFolder.hide();
    }
  }

  populateMaterialGUI(
    material: PtPreviewMaterial,
    materialId: number
  ) {
    this.materialFolder.destroy();
    const materialType =
      materialLabelDict[this.activePtScene.materials[materialId].type];

    this.materialFolder = this.selctedObjectFolder.addFolder(
      `Material - ${materialId} - ${materialType}`
    );

    this.materialFolder.addColor(material, "color").onChange(() => {
      this.actions.setMaterialColor(materialId, material.color);
    });

    if (materialType === "Metal") {
      if (material instanceof THREE.MeshStandardMaterial) {
        this.materialFolder.add(material, "roughness", 0, 1).onChange(() => {
          this.actions.setMaterialFuzz(materialId, material.roughness);
        });
      }
    }

    if (materialType === "Dielectric") {
      if (material instanceof THREE.MeshPhysicalMaterial) {
        this.materialFolder.add(material, "ior", 0, 2.5).onChange(() => {
          this.actions.setMaterialIor(materialId, material.ior);
        });
      }
    }

    this.materialFolder.show();
  }
}
