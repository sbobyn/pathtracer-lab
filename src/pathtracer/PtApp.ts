import * as THREE from "three";
import { GUI, Controller } from "lil-gui";
import PtRenderer from "./PtRenderer";
import PtScene, {
  type PtPreviewMaterial,
  type PtSphereMesh,
} from "./PtScene";
import { PresetPtScenes } from "./PresetPtScenes";
import { defaultState, type PtState } from "./PtState";

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

  constructor(canvas: HTMLCanvasElement) {
    const ptScene = PresetPtScenes.Part1Simple();
    const settings: PtState = defaultState;
    settings.fov = ptScene.camera.fov; // TODO : fix. add cleaner init of PtState

    const ptRenderer = new PtRenderer(canvas, ptScene, settings);

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
        const newScene = PresetPtScenes[sceneKey]();

        // reset GUI state
        this.intersectGroup = newScene.intersectGroup;
        this.selctedObjectFolder.hide();
        this.backgroundColorTopGui.setValue(newScene.backgroundColorTop);
        this.backgroundColorBottomGui.setValue(newScene.backgroundColorBottom);
        this.fovGui.setValue(newScene.camera.fov);
        this.toggleDoFGui.setValue(false);
        this.transformControlGui.setValue("translate");
        this.numSamplesGui.setValue(1);

        // swap in renderer
        ptRenderer.setScene(newScene);
        this.activePtScene = newScene;
      });

    const raytracingToggleGUI = this.gui
      .add(settings, "pathtracingEnabled")
      .onChange(() => {
        ptRenderer.shaderCanvas.resetAccumulation();
      });
    this.backgroundColorTopGui = this.gui
      .addColor(settings, "backgroundColorTop")
      .onChange((value: string | number | THREE.Color) => {
        const color = new THREE.Color(value);
        this.activePtScene.scene.background = color;
        ptRenderer.uniforms.uBackgroundColorTop.value = color;
        this.activePtScene.dirLight.color = color;
        ptRenderer.shaderCanvas.resetAccumulation();
      });

    this.backgroundColorBottomGui = this.gui
      .addColor(settings, "backgroundColorBottom")
      .onChange((value: string | number | THREE.Color) => {
        const color = new THREE.Color(value);
        ptRenderer.uniforms.uBackgroundColorBottom.value = color;
        ptRenderer.shaderCanvas.resetAccumulation();
      });

    this.fovGui = this.gui.add(settings, "fov", 10, 120, 1).onChange(() => {
      ptRenderer.camera.fov = settings.fov;
      ptRenderer.camera.updateProjectionMatrix();
      ptRenderer.uniforms.uCamera.value.halfHeight = Math.tan(
        THREE.MathUtils.degToRad(ptRenderer.camera.fov) / 2
      );
      ptRenderer.uniforms.uCamera.value.halfWidth =
        ptRenderer.uniforms.uCamera.value.halfHeight * ptRenderer.camera.aspect;
      ptRenderer.shaderCanvas.resetAccumulation();
    });

    const raytracingSettingsFolder = this.gui.addFolder("Raytracing Settings");
    if (!settings.pathtracingEnabled) {
      raytracingSettingsFolder.hide();
    }

    this.numSamplesGui = raytracingSettingsFolder
      .add(settings, "numSamples", 1, 20, 1)
      .onChange(() => {
        ptRenderer.uniforms.uNumSamples.value = settings.numSamples;
        ptRenderer.shaderCanvas.resetAccumulation();
      })
      .name("Samples");

    raytracingSettingsFolder
      .add(settings, "maxRayDepth", 1, 20, 1)
      .onChange(() => {
        ptRenderer.uniforms.uMaxRayDepth.value = settings.maxRayDepth;
        ptRenderer.shaderCanvas.resetAccumulation();
      })
      .name("Max Ray Depth");

    raytracingSettingsFolder
      .add(settings, "resolutionScale", [2.0, 1.0, 0.5, 0.25, 0.125, 0.0625])
      .onChange((value: number) => {
        ptRenderer.shaderCanvas.setResolutionScale(value);
      });

    raytracingToggleGUI.onChange((value: boolean) => {
      ptRenderer.ptPass.enabled = value;
      ptRenderer.renderPass.enabled = !value;
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
        ptRenderer.uniforms.uCamera.value.aperture = value;
        ptRenderer.shaderCanvas.resetAccumulation();
      });
    if (!settings.enableDepthOfField) apertureGUI.disable();
    const focusDistGUI = raytracingSettingsFolder
      .add(settings, "focusDistance", 0.1, 20, 0.1)
      .onChange((value: number) => {
        ptRenderer.uniforms.uCamera.value.focusDistance = value;
        ptRenderer.shaderCanvas.resetAccumulation();
      });
    if (!settings.enableDepthOfField) focusDistGUI.disable();
    this.toggleDoFGui.onChange((value: boolean) => {
      ptRenderer.uniforms.uEnableDoF.value = value;
      if (value) {
        apertureGUI.enable();
        focusDistGUI.enable();
      } else {
        apertureGUI.disable();
        focusDistGUI.disable();
      }
      ptRenderer.shaderCanvas.resetAccumulation();
    });

    this.selctedObjectFolder = this.gui.addFolder("Selected Object");

    this.transformControlGui = this.selctedObjectFolder
      .add(ptRenderer.transformControls, "mode", ["translate", "scale"])
      .name("transform mode")
      .onChange((value: string) => {
        if (value === "scale") {
          ptRenderer.transformControls.showY = false;
          ptRenderer.transformControls.showZ = false;
        } else {
          ptRenderer.transformControls.showY = true;
          ptRenderer.transformControls.showZ = true;
        }
      });

    const selectedPositionXGUI = this.selctedObjectFolder
      .add(this.selectedPosition, "x", -1)
      .onChange((value: number) => {
        if (this.selectedObject) this.selectedObject.position.x = value;
        ptRenderer.shaderCanvas.resetAccumulation();
      });
    const selectedPositionYGUI = this.selctedObjectFolder
      .add(this.selectedPosition, "y", -1)
      .onChange((value: number) => {
        if (this.selectedObject) this.selectedObject.position.y = value;
        ptRenderer.shaderCanvas.resetAccumulation();
      });
    const selectedPositionZGUI = this.selctedObjectFolder
      .add(this.selectedPosition, "z", -1)
      .onChange((value: number) => {
        if (this.selectedObject) this.selectedObject.position.z = value;
        ptRenderer.shaderCanvas.resetAccumulation();
      });
    this.selectedRadiusGui = this.selctedObjectFolder
      .add(this, "selectedRadius", 0)
      .onChange((value: number) => {
        if (this.selectedObject) {
          const sphereIndex = this.selectedObject.userData.sphereIndex;
          this.activePtScene.spheres[sphereIndex].radius = value;
          const scale = value / this.selectedObject.geometry.parameters.radius;
          this.selectedObject.scale.set(scale, scale, scale);
          ptRenderer.shaderCanvas.resetAccumulation();
        }
      })
      .name("radius");

    this.materialFolder = this.selctedObjectFolder.addFolder("Material");

    this.selctedObjectFolder.hide();

    // on this.mouse down check for intersection
    window.addEventListener("pointerdown", (e) => {
      if (this.gui.domElement.contains(e.target as Node)) return;
      if (ptRenderer.transformControls.dragging) return;

      this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
      this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
      this.checkIntersection(ptRenderer);
    });

    ptRenderer.transformControls.mode = "translate";

    ptRenderer.transformControls.addEventListener("change", () => {
      if (!this.selectedObject) {
        console.warn("No selected object in transformControls change event");
        return;
      }

      if (ptRenderer.transformControls.mode === "scale") {
        const scale = this.selectedObject.scale.x;
        this.selectedObject.scale.set(scale, scale, scale);
        const sphereIndex = this.selectedObject.userData.sphereIndex;
        this.activePtScene.spheres[sphereIndex].radius =
          scale * this.selectedObject.geometry.parameters.radius;
        this.selectedRadius =
          this.activePtScene.spheres[sphereIndex].radius;
        this.selectedRadiusGui.updateDisplay();
      } else {
        this.selectedPosition.copy(this.selectedObject.position);
        selectedPositionXGUI.updateDisplay();
        selectedPositionYGUI.updateDisplay();
        selectedPositionZGUI.updateDisplay();
      }
    });
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

      ptRenderer.outlinePass.selectedObjects = [this.selectedObject];
      ptRenderer.transformControls.attach(this.selectedObject);
      this.selctedObjectFolder.show();
      // radius display must be manually updated

      this.selectedRadius =
        this.activePtScene.spheres[sphereIndex].radius;
      this.selectedRadiusGui.updateDisplay();
      this.populateMaterialGUI(
        this.selectedObject.material,
        this.activePtScene.spheres[sphereIndex].materialId,
        ptRenderer
      );
    } else {
      ptRenderer.outlinePass.selectedObjects = [];
      ptRenderer.transformControls.detach();
      this.selctedObjectFolder.hide();
    }
  }

  populateMaterialGUI(
    material: PtPreviewMaterial,
    materialId: number,
    ptRenderer: PtRenderer
  ) {
    this.materialFolder.destroy();
    const materialType =
      materialLabelDict[this.activePtScene.materials[materialId].type];

    this.materialFolder = this.selctedObjectFolder.addFolder(
      `Material - ${materialId} - ${materialType}`
    );

    this.materialFolder.addColor(material, "color").onChange(() => {
      this.activePtScene.materials[materialId].albedo = material.color;
      ptRenderer.shaderCanvas.resetAccumulation();
    });

    if (materialType === "Metal") {
      if (material instanceof THREE.MeshStandardMaterial) {
        this.materialFolder.add(material, "roughness", 0, 1).onChange(() => {
          this.activePtScene.materials[materialId].fuzz = material.roughness;
          ptRenderer.shaderCanvas.resetAccumulation();
        });
      }
    }

    if (materialType === "Dielectric") {
      if (material instanceof THREE.MeshPhysicalMaterial) {
        this.materialFolder.add(material, "ior", 0, 2.5).onChange(() => {
          this.activePtScene.materials[materialId].ior = material.ior;
          ptRenderer.shaderCanvas.resetAccumulation();
        });
      }
    }

    this.materialFolder.show();
  }
}
