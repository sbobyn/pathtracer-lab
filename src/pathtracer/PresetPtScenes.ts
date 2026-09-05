import * as THREE from "three";
import { Text } from "troika-three-text";
import PtScene from "./PtScene";
import PtSphere from "./PtSphere";
import PtQuad from "./PtQuad";
import PtMaterial from "./PtMaterial";
import { createFullScreenPerspectiveCamera } from "../utils/createFullscreenCamera";
import { checkerTexture, imageTexture, perlinTexture } from "./PtTexture";
import textureStudyImage from "../assets/texture-study.svg?url";
import { syncAnalyticLightPreview } from "./PtAnalyticLight";
import { createGradientReflectionTexture } from "./RasterPreviewQuality";
import { builtinEnvironments } from "./BuiltinEnvironments";
import boxGltfUrl from "../assets/gltf/box/Box.glb?url";
import compareTransmissionGltfUrl from "../assets/gltf/khronos-pbr/CompareTransmission.glb?url";
import compareVolumeGltfUrl from "../assets/gltf/khronos-pbr/CompareVolume.glb?url";
import dispersionTestGltfUrl from "../assets/gltf/khronos-pbr/DispersionTest.glb?url";
import dragonDispersionGltfUrl from "../assets/gltf/khronos-pbr/DragonDispersion.glb?url";
import dragonAttenuationGltfUrl from "../assets/gltf/khronos-pbr/DragonAttenuation.glb?url";
import { TeapotGeometry } from "three/examples/jsm/geometries/TeapotGeometry.js";

function createKhronosMaterialReferenceScene(
  source: string,
  label: string,
  cameraPosition = new THREE.Vector3(0, 0, 5),
  lookAt = new THREE.Vector3(0, 0, 0),
  importScale = 1,
  environmentId = "studio-small-03"
) {
  const fallback = PtMaterial.legacyLambert(new THREE.Color(0xaaaaaa));
  const camera = createFullScreenPerspectiveCamera({
    position: cameraPosition,
    lookAt,
    far: 10000,
  });
  camera.fov = 38;
  const scene = new PtScene([], [fallback], camera);
  void scene.loadStaticGltf(source, 0, label, importScale);
  scene.backgroundColorTop.set(0x10141c);
  scene.backgroundColorBottom.set(0x10141c);
  scene.scene.background = scene.backgroundColorTop;
  const environment = builtinEnvironments.find(
    (candidate) => candidate.id === environmentId
  );
  if (environment) scene.setEnvironmentMap(environment.source, environment.label);
  return scene;
}

export function resolutionScaleForPreset(sceneKey: string, fallback: number) {
  if (
    sceneKey === "RTIOW1SphereBvhStudy" ||
    sceneKey === "DamagedHelmetStudy" ||
    sceneKey === "KhronosDragonDispersion" ||
    sceneKey === "KhronosDragonAttenuation"
  ) return 0.25;
  if (
    sceneKey === "PackedTrianglesStudy" ||
    sceneKey === "GlTFSuzanneStudy" ||
    sceneKey === "PrincipledMaterialStudy"
  ) return 0.5;
  return sceneKey === "CornellBox" ? 0.5 : fallback;
}

export const PresetPtScenes: { [key: string]: () => PtScene } = {
  TransmissionVolumeStudy: () => {
    const backdrop = PtMaterial.legacyLambert(checkerTexture(0xf2f4f7, 0x172033, 3));
    const neutralGround = PtMaterial.legacyLambert(new THREE.Color(0.32, 0.36, 0.43));
    const glass = (options: {
      ior?: number;
      roughness?: number;
      thickness?: number;
      attenuationColor?: THREE.Color;
      attenuationDistance?: number;
    } = {}) => PtMaterial.principledMetallicRoughness({
      baseColor: new THREE.Color(1, 1, 1),
      metallic: 0,
      roughness: options.roughness ?? 0,
      ior: options.ior ?? 1.5,
      transmission: 1,
      thickness: options.thickness ?? 1.2,
      attenuationColor: options.attenuationColor,
      attenuationDistance: options.attenuationDistance,
    });
    const materials = [
      backdrop,
      neutralGround,
      PtMaterial.principledMetallicRoughness({
        baseColor: new THREE.Color(0.78, 0.83, 0.9),
        roughness: 0.05,
        metallic: 0,
        ior: 1.5,
      }),
      glass({ thickness: 0 }),
      glass(),
      glass({ roughness: 0.25 }),
      glass({ ior: 2.0 }),
      glass({
        attenuationColor: new THREE.Color(0.18, 0.62, 0.95),
        attenuationDistance: 1.2,
      }),
    ];
    const spheres = [
      // Balanced 4x2 grid. Top: opaque dielectric surface, thin wall,
      // smooth volume, and rough volume. All other inputs are held constant.
      new PtSphere(new THREE.Vector3(-3.0, 2.5, 0), 0.58, 2),
      new PtSphere(new THREE.Vector3(-1.0, 2.5, 0), 0.58, 3),
      new PtSphere(new THREE.Vector3(1.0, 2.5, 0), 0.58, 4),
      new PtSphere(new THREE.Vector3(3.0, 2.5, 0), 0.58, 5),
      // Bottom: higher IOR, then identical absorbing glass with increasing
      // chord length. Their bottoms share a clear label baseline above ground.
      new PtSphere(new THREE.Vector3(-3.0, 0.23, 0), 0.58, 6),
      new PtSphere(new THREE.Vector3(-1.0, -0.05, 0), 0.3, 7),
      new PtSphere(new THREE.Vector3(1.0, 0.15, 0), 0.5, 7),
      new PtSphere(new THREE.Vector3(3.0, 0.4, 0), 0.75, 7),
    ];
    const quads = [
      new PtQuad(
        new THREE.Vector3(-8, -1, -2.2),
        new THREE.Vector3(16, 0, 0),
        new THREE.Vector3(0, 6.5, 0),
        0
      ),
      new PtQuad(
        new THREE.Vector3(-8, -1, 4),
        new THREE.Vector3(16, 0, 0),
        new THREE.Vector3(0, 0, -8),
        1
      ),
    ];
    const camera = createFullScreenPerspectiveCamera({
      position: new THREE.Vector3(0, 0.85, 17.5),
      lookAt: new THREE.Vector3(0, 0.85, 0),
      far: 10000,
    });
    camera.fov = 36;
    const scene = new PtScene(spheres, materials, camera, quads);
    const labels = [
      ["Opaque dielectric\nTransmission 0", spheres[0]],
      ["Thin-walled glass\nThickness 0", spheres[1]],
      ["Clear volume\nThickness 1.2", spheres[2]],
      ["Rough volume\nRoughness 0.25", spheres[3]],
      ["High-IOR volume\nIOR 2.0", spheres[4]],
      ["Absorption: short\nr = 0.30", spheres[5]],
      ["Absorption: medium\nr = 0.50", spheres[6]],
      ["Absorption: long\nr = 0.75", spheres[7]],
    ] as const;
    for (const [description, sphere] of labels) {
      addStudyLabel(
        scene,
        description,
        new THREE.Vector3(
          sphere.position.x,
          sphere.position.y - sphere.radius - 0.08,
          0.35
        ),
        { fontSize: 0.14, maxWidth: 1.65 }
      );
    }
    scene.backgroundColorTop.set(0xd6e8ff);
    scene.backgroundColorBottom.set(0xffffff);
    scene.scene.background = scene.backgroundColorTop;
    return scene;
  },

  PrincipledMaterialStudy: () => {
    const metallicValues = [0, 0.5, 1];
    const roughnessValues = [0.05, 0.25, 0.5, 0.75, 1];
    const materials = [
      PtMaterial.legacyLambert(new THREE.Color(0x303238)),
    ];
    const spheres: PtSphere[] = [];
    for (let row = 0; row < metallicValues.length; row++) {
      for (let column = 0; column < roughnessValues.length; column++) {
        const materialId = materials.push(PtMaterial.principledMetallicRoughness({
          baseColor: new THREE.Color(0xb86b35),
          metallic: metallicValues[row],
          roughness: roughnessValues[column],
        })) - 1;
        spheres.push(new PtSphere(
          new THREE.Vector3((column - 2) * 1.15, 0.25 + row * 1.15, 0),
          0.48,
          materialId
        ));
      }
    }
    const floor = new PtQuad(
      new THREE.Vector3(-5, -0.45, 3),
      new THREE.Vector3(10, 0, 0),
      new THREE.Vector3(0, 0, -6),
      0
    );
    const camera = createFullScreenPerspectiveCamera({
      position: new THREE.Vector3(0, 2.2, 8.5),
      lookAt: new THREE.Vector3(0, 1.2, 0),
      far: 10000,
    });
    camera.fov = 42;
    const scene = new PtScene(spheres, materials, camera, [floor]);
    for (let row = 0; row < metallicValues.length; row++) {
      for (let column = 0; column < roughnessValues.length; column++) {
        const sphere = spheres[row * roughnessValues.length + column];
        addStudyLabel(
          scene,
          `Metal ${metallicValues[row].toFixed(2)} · Rough ${roughnessValues[column].toFixed(2)}`,
          new THREE.Vector3(
            sphere.position.x,
            sphere.position.y - sphere.radius - 0.035,
            0.35
          ),
          { fontSize: 0.085, maxWidth: 1.08 }
        );
      }
    }
    scene.backgroundColorTop.set(0x000000);
    scene.backgroundColorBottom.set(0x000000);
    scene.scene.background = scene.backgroundColorTop;
    const environment = builtinEnvironments.find(
      (candidate) => candidate.id === "studio-small-03"
    );
    if (environment) scene.setEnvironmentMap(environment.source, environment.label);
    return scene;
  },
  GlTFBoxStudy: () => {
    const materials = [
      PtMaterial.legacyLambert(new THREE.Color(0xc8d1dc)),
      PtMaterial.legacyLambert(checkerTexture(0x26384a, 0xd4a75f, 8)),
    ];
    const floor = new PtQuad(
      new THREE.Vector3(-4, -1.01, 4),
      new THREE.Vector3(8, 0, 0),
      new THREE.Vector3(0, 0, -8),
      1
    );
    const camera = createFullScreenPerspectiveCamera({
      position: new THREE.Vector3(3.4, 2.4, 4.2),
      lookAt: new THREE.Vector3(0, 0, 0),
      far: 10000,
    });
    camera.fov = 42;
    const scene = new PtScene([], materials, camera, [floor]);
    void scene.loadStaticGltf(boxGltfUrl, 0, "Khronos glTF Box");
    scene.backgroundColorTop.set(0x000000);
    scene.backgroundColorBottom.set(0x000000);
    scene.scene.background = scene.backgroundColorTop;
    const environment = builtinEnvironments.find(
      (candidate) => candidate.id === "studio-small-03"
    );
    if (environment) scene.setEnvironmentMap(environment.source, environment.label);
    return scene;
  },
  GlTFSuzanneStudy: () => {
    const materials = [
      PtMaterial.legacyLambert(new THREE.Color(0xb8c4d3)),
      PtMaterial.legacyLambert(checkerTexture(0x182b3c, 0xc79552, 10)),
    ];
    const floor = new PtQuad(
      new THREE.Vector3(-4, -1.01, 4),
      new THREE.Vector3(8, 0, 0),
      new THREE.Vector3(0, 0, -8),
      1
    );
    const camera = createFullScreenPerspectiveCamera({
      position: new THREE.Vector3(3.8, 2.3, 4.5),
      lookAt: new THREE.Vector3(0, 0, 0),
      far: 10000,
    });
    camera.fov = 40;
    const scene = new PtScene([], materials, camera, [floor]);
    // The HDR environment provides most of the material response, but it
    // cannot cast a conventional Three.js shadow. Give Suzanne a deliberate
    // raster-only key/fill balance so its floor shadow remains readable.
    scene.ambientLight.intensity = 0.12;
    scene.dirLight.intensity = 3;
    scene.dirLight.shadow.camera.left = -5;
    scene.dirLight.shadow.camera.right = 5;
    scene.dirLight.shadow.camera.top = 5;
    scene.dirLight.shadow.camera.bottom = -5;
    scene.dirLight.shadow.camera.updateProjectionMatrix();
    const source = `${import.meta.env.BASE_URL}models/suzanne/Suzanne.gltf`;
    void scene.loadStaticGltf(source, 0, "Khronos glTF Suzanne");
    scene.backgroundColorTop.set(0x000000);
    scene.backgroundColorBottom.set(0x000000);
    scene.scene.background = scene.backgroundColorTop;
    const environment = builtinEnvironments.find(
      (candidate) => candidate.id === "studio-small-03"
    );
    if (environment) scene.setEnvironmentMap(environment.source, environment.label);
    return scene;
  },
  DamagedHelmetStudy: () => {
    const materials = [
      PtMaterial.legacyLambert(new THREE.Color(0x777777)),
      PtMaterial.legacyLambert(new THREE.Color(0x8a8985)),
    ];
    const camera = createFullScreenPerspectiveCamera({
      position: new THREE.Vector3(0, 0, 3.2),
      lookAt: new THREE.Vector3(0, 0, 0),
      far: 10000,
    });
    camera.fov = 42;
    const floor = new PtQuad(
      new THREE.Vector3(-4, -1.01, 4),
      new THREE.Vector3(8, 0, 0),
      new THREE.Vector3(0, 0, -8),
      1
    );
    const scene = new PtScene([], materials, camera, [floor]);
    const source = `${import.meta.env.BASE_URL}models/damaged-helmet/DamagedHelmet.glb`;
    void scene.loadStaticGltf(source, 0, "Khronos glTF Damaged Helmet");
    scene.backgroundColorTop.set(0x000000);
    scene.backgroundColorBottom.set(0x000000);
    scene.scene.background = scene.backgroundColorTop;
    const environment = builtinEnvironments.find(
      (candidate) => candidate.id === "meadow"
    );
    if (environment) scene.setEnvironmentMap(environment.source, environment.label);
    return scene;
  },
  GlTFSimpleMeshesStudy: () => {
    const materials = [
      PtMaterial.legacyLambert(new THREE.Color(0xe2a84d)),
    ];
    const camera = createFullScreenPerspectiveCamera({
      position: new THREE.Vector3(1, 0.5, 3),
      lookAt: new THREE.Vector3(1, 0.5, 0),
      far: 10000,
    });
    camera.fov = 38;
    const scene = new PtScene([], materials, camera);
    const source = `${import.meta.env.BASE_URL}models/simple-meshes/SimpleMeshes.gltf`;
    void scene.loadStaticGltf(source, 0, "Khronos glTF Simple Meshes");
    scene.backgroundColorTop.set(0x000000);
    scene.backgroundColorBottom.set(0x000000);
    scene.scene.background = scene.backgroundColorTop;
    const environment = builtinEnvironments.find(
      (candidate) => candidate.id === "studio-small-03"
    );
    if (environment) scene.setEnvironmentMap(environment.source, environment.label);
    return scene;
  },
  KhronosCompareTransmission: () => createKhronosMaterialReferenceScene(
    compareTransmissionGltfUrl,
    "Khronos CompareTransmission"
  ),
  KhronosCompareVolume: () => createKhronosMaterialReferenceScene(
    compareVolumeGltfUrl,
    "Khronos CompareVolume"
  ),
  KhronosDispersionTest: () => createKhronosMaterialReferenceScene(
    dispersionTestGltfUrl,
    "Khronos DispersionTest",
    new THREE.Vector3(0, 0.7, 3.9),
    new THREE.Vector3(0, 0.25, 0.35),
    8,
    "relax-inn-seaview-suite"
  ),
  KhronosDragonDispersion: () => {
    const position = new THREE.Vector3(0.404, 1.438, 11.521);
    const direction = new THREE.Vector3(-0.035, -0.124, -0.992).normalize();
    const scene = createKhronosMaterialReferenceScene(
      dragonDispersionGltfUrl,
      "Khronos Dragon Dispersion",
      position,
      position.clone().add(direction),
      1,
      "meadow"
    );
    scene.initialEnvironmentIntensity = 0.8;
    return scene;
  },
  KhronosDragonAttenuation: () => {
    const position = new THREE.Vector3(0.404, 1.438, 11.521);
    const direction = new THREE.Vector3(-0.035, -0.124, -0.992).normalize();
    const scene = createKhronosMaterialReferenceScene(
      dragonAttenuationGltfUrl,
      "Khronos Dragon Attenuation",
      position,
      position.clone().add(direction),
      1,
      "meadow"
    );
    scene.initialEnvironmentIntensity = 0.8;
    return scene;
  },
  RTIOW1Simple: () => {
    const spheres: PtSphere[] = [
      new PtSphere(new THREE.Vector3(0, 0, 0), 0.5, 1), // Center
      new PtSphere(new THREE.Vector3(-1.2, 0, 0), 0.5, 2), // Left
      new PtSphere(new THREE.Vector3(1.2, 0, 0), 0.5, 3), // Right
    ];
    const materials: PtMaterial[] = [
      PtMaterial.legacyLambert(new THREE.Color(0.8, 0.8, 0)), // Ground - Lambert
      PtMaterial.legacyLambert(new THREE.Color(0.1, 0.2, 0.5)), // Center - Lambert
      PtMaterial.legacyDielectric(1.5), // Left - glass in air
      PtMaterial.legacyFuzzyMetal(new THREE.Color(0.8, 0.6, 0.2), 0.1), // Right - Metal
    ];

    const camera = createFullScreenPerspectiveCamera({
      position: new THREE.Vector3(0, 0.5, 2),
      lookAt: new THREE.Vector3(0, 0.5, 0),
      far: 10000,
    });

    return createRtiowGroundScene(spheres, materials, camera, -0.5, 6);
  },

  RTIOW1HollowGlassStudy: () => {
    const materials: PtMaterial[] = [
      PtMaterial.legacyLambert(new THREE.Color(0.35, 0.4, 0.48)),
      PtMaterial.legacyDielectric(1.5),
      // The inner boundary is air enclosed by glass, so its IOR is relative
      // to the surrounding glass rather than to the scene atmosphere.
      PtMaterial.legacyDielectric(1 / 1.5),
      PtMaterial.legacyLambert(new THREE.Color(0.75, 0.12, 0.05)),
      PtMaterial.legacyLambert(new THREE.Color(0.08, 0.3, 0.75)),
    ];
    const spheres = [
      // Solid reference.
      new PtSphere(new THREE.Vector3(-1.15, 0, 0), 0.8, 1),
      // Hollow reference: glass outer boundary and concentric air cavity.
      new PtSphere(new THREE.Vector3(1.15, 0, 0), 0.8, 1),
      new PtSphere(new THREE.Vector3(1.15, 0, 0), 0.74, 2),
      // Colored objects behind the glass make lensing differences obvious.
      new PtSphere(new THREE.Vector3(-1.15, -0.38, -2), 0.42, 3),
      new PtSphere(new THREE.Vector3(1.15, -0.38, -2), 0.42, 4),
    ];
    const camera = createFullScreenPerspectiveCamera({
      position: new THREE.Vector3(0, 0.35, 5),
      lookAt: new THREE.Vector3(0, 0, 0),
      far: 10000,
    });
    camera.fov = 34;
    const scene = createRtiowGroundScene(spheres, materials, camera, -0.8, 6);
    const previewSpheres = scene.getSphereMeshes();
    const solidGlass = previewSpheres[0].material;
    const hollowGlass = solidGlass.clone();
    if (
      solidGlass instanceof THREE.MeshPhysicalMaterial &&
      hollowGlass instanceof THREE.MeshPhysicalMaterial
    ) {
      solidGlass.thickness = 1.6;
      // Three.js cannot track the nested glass/air medium. Its closest native
      // representation is a transmissive shell whose optical thickness is the
      // distance between the authored outer and inner radii.
      hollowGlass.thickness = 0.8 - 0.74;
      hollowGlass.needsUpdate = true;
      previewSpheres[1].material = hollowGlass;
    }
    // Keep the reciprocal-IOR cavity in the analytic scene for path tracing,
    // but do not draw it as a second overlapping physical material in raster.
    previewSpheres[2].material.visible = false;
    return scene;
  },

  RTIOW1Final: () => {
    const spheres: PtSphere[] = [];
    const materials: PtMaterial[] = [
      PtMaterial.legacyLambert(new THREE.Color(0.5, 0.5, 0.5)), // Ground - Lambert
    ];

    for (let a = -2; a <= 2; a++) {
      for (let b = -2; b <= 2; b++) {
        const chooseMat = Math.random();
        const center = new THREE.Vector3(
          3 * a + 1.3 * (Math.random() - 0.5),
          0.2,
          3 * b + 1.3 * (Math.random() - 0.5)
        );

        if (
          center.distanceTo(new THREE.Vector3(0, 0.2, 0)) > 0.9 &&
          center.distanceTo(new THREE.Vector3(-4, 0.2, 0)) > 0.9 &&
          center.distanceTo(new THREE.Vector3(4, 0.2, 0)) > 0.9
        ) {
          if (chooseMat < 0.8) {
            // Diffuse
            const albedo = new THREE.Color(
              Math.random() * Math.random(),
              Math.random() * Math.random(),
              Math.random() * Math.random()
            );
            materials.push(PtMaterial.legacyLambert(albedo));
            spheres.push(new PtSphere(center, 0.2, materials.length - 1));
          } else if (chooseMat < 0.95) {
            // Metal
            const albedo = new THREE.Color(
              0.5 * (1 + Math.random()),
              0.5 * (1 + Math.random()),
              0.5 * (1 + Math.random())
            );
            const fuzz = 0.5 * Math.random();
            materials.push(PtMaterial.legacyFuzzyMetal(albedo, fuzz));
            spheres.push(new PtSphere(center, 0.2, materials.length - 1));
          } else {
            // Glass
            materials.push(PtMaterial.legacyDielectric(1.5));
            spheres.push(new PtSphere(center, 0.2, materials.length - 1));
          }
        }
      }
    }

    materials.push(PtMaterial.legacyLambert(new THREE.Color(0.4, 0.2, 0.1))); // Center - Lambert
    spheres.push(
      new PtSphere(new THREE.Vector3(-4, 1, 0), 1.0, materials.length - 1)
    );

    materials.push(PtMaterial.legacyDielectric(1.5)); // Left - Dielectric
    spheres.push(
      new PtSphere(new THREE.Vector3(0, 1, 0), 1.0, materials.length - 1)
    );

    materials.push(PtMaterial.legacyFuzzyMetal(new THREE.Color(0.7, 0.6, 0.5), 0.0)); // Right - Metal
    spheres.push(
      new PtSphere(new THREE.Vector3(4, 1, 0), 1.0, materials.length - 1)
    );

    const camera = createFullScreenPerspectiveCamera({
      position: new THREE.Vector3(13, 2, 3),
      lookAt: new THREE.Vector3(0, 0, 0),
      far: 10000,
    });
    camera.fov = 20;

    return createRtiowGroundScene(spheres, materials, camera, 0, 12);
  },

  RTIOW1SphereBvhStudy: () => {
    const random = createSeededRandom(0x805b7a);
    const spheres: PtSphere[] = [];
    const materials: PtMaterial[] = [PtMaterial.legacyLambert(new THREE.Color(0.5, 0.5, 0.5))];
    const protectedCenters = [
      new THREE.Vector3(0, 0.2, 0),
      new THREE.Vector3(-4, 0.2, 0),
      new THREE.Vector3(4, 0.2, 0),
    ];

    for (let a = -11; a < 11; a += 1) {
      for (let b = -11; b < 11; b += 1) {
        const center = new THREE.Vector3(a + 0.9 * random(), 0.2, b + 0.9 * random());
        if (protectedCenters.some((protectedCenter) => center.distanceTo(protectedCenter) <= 0.9)) continue;

        const chooseMaterial = random();
        if (chooseMaterial < 0.8) {
          materials.push(PtMaterial.legacyLambert(new THREE.Color(
            random() * random(), random() * random(), random() * random()
          )));
        } else if (chooseMaterial < 0.95) {
          materials.push(PtMaterial.legacyFuzzyMetal(new THREE.Color(
            0.5 * (1 + random()), 0.5 * (1 + random()), 0.5 * (1 + random())
          ), 0.5 * random()));
        } else {
          materials.push(PtMaterial.legacyDielectric(1.5));
        }
        spheres.push(new PtSphere(center, 0.2, materials.length - 1));
      }
    }

    materials.push(PtMaterial.legacyLambert(new THREE.Color(0.4, 0.2, 0.1)));
    spheres.push(new PtSphere(new THREE.Vector3(-4, 1, 0), 1, materials.length - 1));
    materials.push(PtMaterial.legacyDielectric(1.5));
    spheres.push(new PtSphere(new THREE.Vector3(0, 1, 0), 1, materials.length - 1));
    materials.push(PtMaterial.legacyFuzzyMetal(new THREE.Color(0.7, 0.6, 0.5), 0));
    spheres.push(new PtSphere(new THREE.Vector3(4, 1, 0), 1, materials.length - 1));

    const camera = createFullScreenPerspectiveCamera({
      position: new THREE.Vector3(13, 2, 3), lookAt: new THREE.Vector3(0, 0, 0), far: 10000,
    });
    camera.fov = 20;
    return createRtiowGroundScene(spheres, materials, camera, 0, 15);
  },

  TextureStudy: () => {
    const materials: PtMaterial[] = [
      PtMaterial.legacyLambert(checkerTexture(0x183a1d, 0xb7d66b, 16)),
      PtMaterial.legacyLambert(checkerTexture(0xf4ead5, 0xb84b3e, 12)),
      PtMaterial.legacyFuzzyMetal(new THREE.Color(0xc8cbd2), 0),
      PtMaterial.legacyLambert(perlinTexture(0x101820, 0xe8dcc4, 4, 10)),
      PtMaterial.legacyLambert(imageTexture(textureStudyImage)),
    ];
    const spheres: PtSphere[] = [
      new PtSphere(new THREE.Vector3(0, -100.5, 0), 100, 0),
      new PtSphere(new THREE.Vector3(-1.2, 0, 0), 0.5, 1),
      new PtSphere(new THREE.Vector3(0, 0, 0), 0.5, 2),
      new PtSphere(new THREE.Vector3(1.2, 0, 0), 0.5, 3),
      new PtSphere(new THREE.Vector3(0, 1.05, 0), 0.45, 4),
    ];
    const camera = createFullScreenPerspectiveCamera({
      position: new THREE.Vector3(0, 0.6, 3.2),
      lookAt: new THREE.Vector3(0, 0.25, 0),
      far: 10000,
    });
    camera.fov = 48;
    return new PtScene(spheres, materials, camera);
  },

  QuadStudy: () => {
    const materials: PtMaterial[] = [
      PtMaterial.legacyLambert(checkerTexture(0x23324a, 0xd7e3f4, 12)),
      PtMaterial.legacyLambert(imageTexture(textureStudyImage)),
      PtMaterial.legacyLambert(perlinTexture(0x6f263d, 0xf0c987, 5, 8)),
      PtMaterial.legacyFuzzyMetal(new THREE.Color(0xd8dbe2), 0),
    ];
    const spheres = [
      new PtSphere(new THREE.Vector3(-1.45, 0, 0.1), 0.5, 3),
    ];
    const quads = [
      // Horizontal reference plane: +U runs right and +V runs away from camera.
      new PtQuad(
        new THREE.Vector3(-3, -0.5, 2),
        new THREE.Vector3(6, 0, 0),
        new THREE.Vector3(0, 0, -5),
        0
      ),
      // Upright UV card facing the camera.
      new PtQuad(
        new THREE.Vector3(-1.1, -0.5, -1.35),
        new THREE.Vector3(2.2, 0, 0),
        new THREE.Vector3(0, 2, 0),
        1
      ),
      // Slanted parallelogram exposes bounded-plane and conservative-AABB mistakes.
      new PtQuad(
        new THREE.Vector3(0.75, -0.5, 0.45),
        new THREE.Vector3(1.35, 0, -0.9),
        new THREE.Vector3(0, 1.5, 0),
        2
      ),
    ];
    const camera = createFullScreenPerspectiveCamera({
      position: new THREE.Vector3(0, 1.1, 4.3),
      lookAt: new THREE.Vector3(0, 0.35, -0.35),
      far: 10000,
    });
    camera.fov = 48;
    return new PtScene(spheres, materials, camera, quads);
  },

  EmissiveStudy: () => {
    const materials: PtMaterial[] = [
      PtMaterial.legacyLambert(perlinTexture(0x111722, 0x8b7451, 2.5, 7)),
      PtMaterial.legacyLambert(new THREE.Color(0.72, 0.18, 0.08)),
      PtMaterial.legacyFuzzyMetal(new THREE.Color(0xd8e2ee), 0),
      PtMaterial.emissive(new THREE.Color(1, 0.64, 0.28), 14),
      PtMaterial.emissive(new THREE.Color(0.2, 0.48, 1), 9, true),
      PtMaterial.emissive(new THREE.Color(1, 0.12, 0.06), 7, true),
    ];
    const spheres = [
      new PtSphere(new THREE.Vector3(0.65, 0.05, -1.1), 0.55, 2),
      new PtSphere(new THREE.Vector3(2.1, 1.15, -0.35), 0.3, 4),
      new PtSphere(new THREE.Vector3(-2.45, 0.95, -0.25), 0.25, 5),
    ];
    const quads = [
      new PtQuad(
        new THREE.Vector3(-5, -0.5, 3),
        new THREE.Vector3(10, 0, 0),
        new THREE.Vector3(0, 0, -10),
        0
      ),
      // The winding points the emitting face down toward the study objects.
      new PtQuad(
        new THREE.Vector3(-1.2, 3, -1.2),
        new THREE.Vector3(2.4, 0, 0),
        new THREE.Vector3(0, 0, 1.4),
        3
      ),
    ];
    const camera = createFullScreenPerspectiveCamera({
      position: new THREE.Vector3(0, 1.7, 5.6),
      lookAt: new THREE.Vector3(0.25, 0.45, -0.65),
      far: 10000,
    });
    camera.fov = 45;
    const scene = new PtScene(spheres, materials, camera, quads);
    // Replace the diffuse sphere with an orange silhouette reflected in the metal sphere.
    const teapotGeometry = new TeapotGeometry(0.5, 8, true, true, true, true, true);
    teapotGeometry.computeBoundingBox();
    const teapot = scene.addTriangleMesh(teapotGeometry, 1, "Utah teapot");
    teapot.position.set(-1.25, -0.5 - (teapotGeometry.boundingBox?.min.y ?? 0), 0.2);
    teapot.rotation.y = THREE.MathUtils.degToRad(-25);
    teapot.updateMatrixWorld(true);
    scene.backgroundColorTop.set(0x000000);
    scene.backgroundColorBottom.set(0x000000);
    scene.scene.background = scene.backgroundColorTop;
    return scene;
  },

  AnalyticLightsStudy: () => {
    const materials: PtMaterial[] = [
      PtMaterial.legacyLambert(checkerTexture(0x10131a, 0x343d4f, 3.5)),
      PtMaterial.legacyLambert(new THREE.Color(0xeeeeee)),
      PtMaterial.legacyLambert(new THREE.Color(0x7187a8)),
      PtMaterial.legacyFuzzyMetal(new THREE.Color(0xd8dde8), 0.08),
    ];
    const spheres = [
      new PtSphere(new THREE.Vector3(-1.65, 0.1, -0.65), 0.6, 1),
      new PtSphere(new THREE.Vector3(0, 0.15, -1.15), 0.65, 3),
      new PtSphere(new THREE.Vector3(1.65, 0.1, -0.65), 0.6, 2),
    ];
    const quads = [
      new PtQuad(
        new THREE.Vector3(-5, -0.5, 3),
        new THREE.Vector3(10, 0, 0),
        new THREE.Vector3(0, 0, -10),
        0
      ),
    ];
    const camera = createFullScreenPerspectiveCamera({
      position: new THREE.Vector3(0, 2.1, 6.2),
      lookAt: new THREE.Vector3(0, 0.25, -0.7),
      far: 10000,
    });
    camera.fov = 43;

    const scene = new PtScene(spheres, materials, camera, quads);
    scene.backgroundColorTop.set(0x000000);
    scene.backgroundColorBottom.set(0x000000);
    scene.scene.background = scene.backgroundColorTop;

    const point = scene.createPointLightNode(
      new THREE.Vector3(-2.15, 2.2, 0.35),
      "Warm Point Light"
    );
    point.userData.pathTracer.color.set(0xff743d);
    point.userData.pathTracer.intensity = 18;
    syncAnalyticLightPreview(point);

    const spot = scene.createSpotLightNode(
      new THREE.Vector3(2.7, 3.25, 1.35),
      "Cool Spot Light"
    );
    spot.userData.pathTracer.color.set(0x6da8ff);
    spot.userData.pathTracer.intensity = 38;
    spot.userData.pathTracer.innerConeAngle = 16;
    spot.userData.pathTracer.outerConeAngle = 25;
    orientNegativeZToward(spot, new THREE.Vector3(1.55, 0, -0.7));
    syncAnalyticLightPreview(spot);

    const sun = scene.createDirectionalLightNode(
      new THREE.Vector3(0, 3.8, 1.2),
      "Soft Directional Light"
    );
    sun.userData.pathTracer.color.set(0xffedc7);
    sun.userData.pathTracer.intensity = 0.35;
    sun.userData.pathTracer.angularDiameter = 2;
    orientNegativeZToward(sun, new THREE.Vector3(-0.45, 0, -1));
    syncAnalyticLightPreview(sun);

    scene.insertAnalyticLightNode(point);
    scene.insertAnalyticLightNode(spot);
    scene.insertAnalyticLightNode(sun);
    return scene;
  },

  EnvironmentStudy: () => {
    const materials: PtMaterial[] = [
      PtMaterial.legacyLambert(new THREE.Color(0x777777)),
      PtMaterial.legacyFuzzyMetal(new THREE.Color(0xf2f2f2), 0),
      PtMaterial.legacyFuzzyMetal(new THREE.Color(0xc9d3df), 0.32),
      PtMaterial.legacyLambert(new THREE.Color(0xb85f3c)),
    ];
    const spheres = [
      // A mirror, a rough conductor, and a diffuse reference make environment
      // orientation, reflections, roughness, and illumination easy to compare.
      new PtSphere(new THREE.Vector3(-1.45, 0.2, -0.5), 0.7, 1),
      new PtSphere(new THREE.Vector3(0, 0.2, -0.85), 0.7, 2),
      new PtSphere(new THREE.Vector3(1.45, 0.2, -0.5), 0.7, 3),
    ];
    const quads = [
      new PtQuad(
        new THREE.Vector3(-5, -0.5, 3),
        new THREE.Vector3(10, 0, 0),
        new THREE.Vector3(0, 0, -10),
        0
      ),
    ];
    const camera = createFullScreenPerspectiveCamera({
      position: new THREE.Vector3(0, 1.55, 5.4),
      lookAt: new THREE.Vector3(0, 0.2, -0.65),
      far: 10000,
    });
    camera.fov = 45;
    const scene = new PtScene(spheres, materials, camera, quads);
    // HDR decoding is asynchronous. A black fallback avoids flashing the
    // default blue/white gradient before the environment becomes available.
    scene.backgroundColorTop.set(0x000000);
    scene.backgroundColorBottom.set(0x000000);
    scene.scene.background = scene.backgroundColorTop;
    const environment = builtinEnvironments.find(
      (candidate) => candidate.id === "relax-inn-seaview-suite"
    );
    if (environment) scene.setEnvironmentMap(environment.source, environment.label);
    return scene;
  },

  TriangleStudy: () => {
    const materials: PtMaterial[] = [
      PtMaterial.legacyLambert(checkerTexture(0x183a5a, 0xf0b35a, 5)),
      PtMaterial.legacyFuzzyMetal(new THREE.Color(0xe7edf5), 0.08),
      PtMaterial.legacyLambert(new THREE.Color(0x686868)),
    ];
    const floor = new PtQuad(
      new THREE.Vector3(-5, -0.75, 3),
      new THREE.Vector3(10, 0, 0),
      new THREE.Vector3(0, 0, -10),
      2
    );
    const camera = createFullScreenPerspectiveCamera({
      position: new THREE.Vector3(0, 1.55, 5.2),
      lookAt: new THREE.Vector3(0, 0.15, -0.65),
      far: 10000,
    });
    camera.fov = 43;
    const scene = new PtScene([], materials, camera, [floor]);
    const checkerMesh = scene.addTriangleMesh(createIndexedPyramidGeometry(), 0, "Indexed checker pyramid");
    checkerMesh.position.set(-1.15, -0.74, -0.7);
    checkerMesh.rotation.y = -0.35;
    const metalMesh = scene.addTriangleMesh(createIndexedPyramidGeometry(), 1, "Indexed metal pyramid");
    metalMesh.position.set(1.15, -0.74, -0.7);
    metalMesh.rotation.y = 0.45;
    metalMesh.scale.setScalar(1.08);
    scene.triangleMeshGroup.updateMatrixWorld(true);
    scene.backgroundColorTop.set(0x000000);
    scene.backgroundColorBottom.set(0x000000);
    scene.scene.background = scene.backgroundColorTop;
    const environment = builtinEnvironments.find(
      (candidate) => candidate.id === "relax-inn-seaview-suite"
    );
    if (environment) scene.setEnvironmentMap(environment.source, environment.label);
    return scene;
  },

  PackedTrianglesStudy: () => {
    const materials: PtMaterial[] = [
      PtMaterial.legacyLambert(checkerTexture(0x172a3a, 0xd89b4a, 18)),
      PtMaterial.legacyFuzzyMetal(new THREE.Color(0xe8edf4), 0.04),
    ];
    const spheres = [new PtSphere(new THREE.Vector3(0, 0.25, -0.8), 0.65, 1)];
    const camera = createFullScreenPerspectiveCamera({
      position: new THREE.Vector3(4.8, 3.5, 5.8),
      lookAt: new THREE.Vector3(0, -0.3, -0.7),
      far: 10000,
    });
    camera.fov = 43;
    const scene = new PtScene(spheres, materials, camera);
    const wave = scene.addTriangleMesh(createIndexedWaveGeometry(32, 8), 0, "Packed 2,048-triangle wave");
    wave.position.set(0, -0.55, -1.1);
    scene.triangleMeshGroup.updateMatrixWorld(true);
    scene.backgroundColorTop.set(0x000000);
    scene.backgroundColorBottom.set(0x000000);
    scene.scene.background = scene.backgroundColorTop;
    const environment = builtinEnvironments.find(
      (candidate) => candidate.id === "relax-inn-seaview-suite"
    );
    if (environment) scene.setEnvironmentMap(environment.source, environment.label);
    return scene;
  },

  CornellBox: () => {
    const materials: PtMaterial[] = [
      PtMaterial.legacyLambert(new THREE.Color(0.73, 0.73, 0.73)),
      PtMaterial.legacyLambert(new THREE.Color(0.65, 0.05, 0.05)),
      PtMaterial.legacyLambert(new THREE.Color(0.12, 0.45, 0.15)),
      PtMaterial.emissive(new THREE.Color(1, 0.88, 0.68), 12),
      PtMaterial.legacyLambert(new THREE.Color(0.78, 0.8, 0.84)),
    ];
    const quads = [
      // Open-front room. Winding points each geometric normal into the box.
      new PtQuad(new THREE.Vector3(-1.5, -1.5, 1.5), new THREE.Vector3(3, 0, 0), new THREE.Vector3(0, 0, -3), 0),
      new PtQuad(new THREE.Vector3(-1.5, 1.5, -1.5), new THREE.Vector3(3, 0, 0), new THREE.Vector3(0, 0, 3), 0),
      new PtQuad(new THREE.Vector3(-1.5, -1.5, -1.5), new THREE.Vector3(3, 0, 0), new THREE.Vector3(0, 3, 0), 0),
      new PtQuad(new THREE.Vector3(-1.5, -1.5, 1.5), new THREE.Vector3(0, 0, -3), new THREE.Vector3(0, 3, 0), 1),
      new PtQuad(new THREE.Vector3(1.5, -1.5, -1.5), new THREE.Vector3(0, 0, 3), new THREE.Vector3(0, 3, 0), 2),
      // A downward-facing emissive quad acts as the area light.
      new PtQuad(new THREE.Vector3(-0.45, 1.49, -0.45), new THREE.Vector3(0.9, 0, 0), new THREE.Vector3(0, 0, 0.9), 3),
    ];
    const camera = createFullScreenPerspectiveCamera({
      position: new THREE.Vector3(0, 0, 5.4),
      lookAt: new THREE.Vector3(0, 0, 0),
      far: 10000,
    });
    camera.fov = 38;
    const scene = new PtScene([], materials, camera, quads);
    const shortBoxMin = new THREE.Vector3(-1.05, -1.49, -0.75);
    const shortBoxMax = new THREE.Vector3(-0.15, -0.15, 0.15);
    const shortBoxRotation = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(0, THREE.MathUtils.degToRad(19), 0)
    );
    const shortBoxCenter = shortBoxMin.clone().add(shortBoxMax).multiplyScalar(0.5).add(new THREE.Vector3(0, 0, 0.27));
    scene.insertBoxMesh(scene.createBoxMesh(
      shortBoxCenter,
      shortBoxRotation,
      shortBoxMax.clone().sub(shortBoxMin),
      0,
      "Short box"
    ));
    const teapotGeometry = new TeapotGeometry(0.34, 8, true, true, true, true, true);
    teapotGeometry.computeBoundingBox();
    const teapot = scene.addTriangleMesh(teapotGeometry, 4, "Utah teapot");
    teapot.position.set(
      shortBoxCenter.x,
      shortBoxMax.y - (teapotGeometry.boundingBox?.min.y ?? 0),
      shortBoxCenter.z
    );
    teapot.quaternion.copy(shortBoxRotation);
    teapot.updateMatrixWorld(true);
    const tallBoxMin = new THREE.Vector3(0.25, -1.49, -1.05);
    const tallBoxMax = new THREE.Vector3(1.05, 0.55, -0.15);
    const tallBoxRotation = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(0, THREE.MathUtils.degToRad(-21), 0)
    );
    scene.insertBoxMesh(scene.createBoxMesh(
      tallBoxMin.clone().add(tallBoxMax).multiplyScalar(0.5),
      tallBoxRotation,
      tallBoxMax.clone().sub(tallBoxMin),
      0,
      "Tall box"
    ));
    scene.backgroundColorTop.set(0x000000);
    scene.backgroundColorBottom.set(0x000000);
    scene.scene.background = scene.backgroundColorTop;
    return scene;
  },
};

// Presentation order follows the first Git commit that introduced each study.
// Keep the stable keys unnumbered so reorganizing the UI never invalidates
// saved preferences or external scene references.
export const presetPtSceneOrder = [
  "RTIOW1Simple",
  "RTIOW1HollowGlassStudy",
  "RTIOW1Final",
  "TextureStudy",
  "QuadStudy",
  "CornellBox",
  "EmissiveStudy",
  "AnalyticLightsStudy",
  "EnvironmentStudy",
  "TriangleStudy",
  "RTIOW1SphereBvhStudy",
  "PackedTrianglesStudy",
  "GlTFBoxStudy",
  "GlTFSuzanneStudy",
  "GlTFSimpleMeshesStudy",
  "DamagedHelmetStudy",
  "PrincipledMaterialStudy",
  "TransmissionVolumeStudy",
  "KhronosCompareTransmission",
  "KhronosCompareVolume",
  "KhronosDispersionTest",
  "KhronosDragonDispersion",
  "KhronosDragonAttenuation",
] as const;

export function presetPtSceneLabel(sceneKey: string) {
  const index = presetPtSceneOrder.indexOf(sceneKey as typeof presetPtSceneOrder[number]);
  return index === -1 ? sceneKey : `${String(index).padStart(2, "0")}-${sceneKey}`;
}

function createSeededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function createRtiowGroundQuad(y: number, size: number) {
  return new PtQuad(
    new THREE.Vector3(-size, y, size),
    new THREE.Vector3(size * 2, 0, 0),
    new THREE.Vector3(0, 0, -size * 2),
    0
  );
}

function createRtiowGroundScene(
  spheres: PtSphere[],
  materials: PtMaterial[],
  camera: THREE.PerspectiveCamera,
  groundY: number,
  groundSize: number
) {
  const scene = new PtScene(spheres, materials, camera, [
    createRtiowGroundQuad(groundY, groundSize),
  ]);
  // The zero-thickness floor only needs to receive object shadows. Letting it
  // cast into the directional shadow map produces large-scale self-shadow
  // acne that looks like a second, overlapping quad.
  scene.getQuadMeshes()[0].castShadow = false;
  // Metallic raster materials need image-based lighting. Mirror the path
  // tracer's procedural sky/ground gradient without changing its environment
  // mode or the camera-visible raster background.
  scene.rasterGradientEnvironmentTexture = createGradientReflectionTexture(
    scene.backgroundColorTop,
    scene.backgroundColorBottom
  );
  scene.scene.environment = scene.rasterGradientEnvironmentTexture;
  for (const material of scene.getMaterials()) {
    if (
      material instanceof THREE.MeshStandardMaterial &&
      material.metalness > 0.5
    ) {
      material.envMap = scene.rasterGradientEnvironmentTexture;
      material.envMapIntensity = 1.5;
      material.needsUpdate = true;
    }
  }
  // These low, wide scenes view the receiver at a grazing angle, amplifying
  // light-space depth precision into long contour bands. Offset shadow tests
  // along the floor normal while retaining the spheres' contact shadows.
  scene.dirLight.shadow.bias = -0.0005;
  scene.dirLight.shadow.normalBias = 0.08;
  const shadowExtent = Math.min(20, groundSize * 1.35);
  scene.dirLight.shadow.camera.left = -shadowExtent;
  scene.dirLight.shadow.camera.right = shadowExtent;
  scene.dirLight.shadow.camera.top = shadowExtent;
  scene.dirLight.shadow.camera.bottom = -shadowExtent;
  scene.dirLight.shadow.camera.updateProjectionMatrix();
  return scene;
}

function addStudyLabel(
  scene: PtScene,
  description: string,
  position: THREE.Vector3,
  options: { fontSize: number; maxWidth: number }
) {
  const label = new Text();
  label.text = description;
  label.fontSize = options.fontSize;
  label.lineHeight = 1.18;
  label.maxWidth = options.maxWidth;
  label.textAlign = "center";
  label.anchorX = "center";
  label.anchorY = "top";
  label.color = 0xffffff;
  label.outlineColor = 0x101827;
  label.outlineWidth = "8%";
  label.material.depthTest = false;
  label.material.depthWrite = false;
  label.renderOrder = 100;
  label.position.copy(position);
  label.userData.billboard = true;
  scene.annotationGroup.add(label);
  label.sync();
}

function createIndexedPyramidGeometry() {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute([
    -0.8, 0, -0.8,
     0.8, 0, -0.8,
     0.8, 0,  0.8,
    -0.8, 0,  0.8,
     0, 1.7, 0,
  ], 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute([
    0, 0,
    1, 0,
    1, 1,
    0, 1,
    0.5, 0.5,
  ], 2));
  geometry.setIndex([
    0, 2, 1, 0, 3, 2,
    0, 1, 4, 1, 2, 4, 2, 3, 4, 3, 0, 4,
  ]);
  geometry.computeVertexNormals();
  return geometry;
}

function createIndexedWaveGeometry(segments: number, size: number) {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let z = 0; z <= segments; z++) {
    for (let x = 0; x <= segments; x++) {
      const u = x / segments;
      const v = z / segments;
      const px = (u - 0.5) * size;
      const pz = (v - 0.5) * size;
      const py = 0.18 * Math.sin(px * 1.7) * Math.cos(pz * 1.35);
      positions.push(px, py, pz);
      uvs.push(u, v);
    }
  }
  const stride = segments + 1;
  for (let z = 0; z < segments; z++) {
    for (let x = 0; x < segments; x++) {
      const a = z * stride + x;
      const b = a + 1;
      const d = (z + 1) * stride + x;
      const c = d + 1;
      indices.push(a, d, b, b, d, c);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function orientNegativeZToward(
  object: THREE.Object3D,
  target: THREE.Vector3
) {
  const direction = target.clone().sub(object.position).normalize();
  object.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), direction);
}
