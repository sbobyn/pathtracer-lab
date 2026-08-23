import * as THREE from "three";
import PtScene from "./PtScene";
import PtSphere from "./PtSphere";
import PtQuad from "./PtQuad";
import PtMaterial, { PtMaterialType } from "./PtMaterial";
import { createFullScreenPerspectiveCamera } from "../utils/createFullscreenCamera";
import { checkerTexture, imageTexture, perlinTexture } from "./PtTexture";
import textureStudyImage from "../assets/texture-study.svg?url";

export function resolutionScaleForPreset(sceneKey: string, fallback: number) {
  return sceneKey === "CornellBox" ? 0.5 : fallback;
}

export const PresetPtScenes: { [key: string]: () => PtScene } = {
  Part1Simple: () => {
    const spheres: PtSphere[] = [
      new PtSphere(new THREE.Vector3(0, -100.5, 0), 100, 0), // Ground
      new PtSphere(new THREE.Vector3(0, 0, 0), 0.5, 1), // Center
      new PtSphere(new THREE.Vector3(-1.2, 0, 0), 0.5, 2), // Left
      new PtSphere(new THREE.Vector3(1.2, 0, 0), 0.5, 3), // Right
    ];
    const materials: PtMaterial[] = [
      new PtMaterial(0, new THREE.Color(0.8, 0.8, 0)), // Ground - Lambert
      new PtMaterial(0, new THREE.Color(0.1, 0.2, 0.5)), // Center - Lambert
      new PtMaterial(2, new THREE.Color(1, 1, 1), 0, 1 / 1.33), // Left - Dielectric
      new PtMaterial(1, new THREE.Color(0.8, 0.6, 0.2), 0.1), // Right - Metal
    ];

    const camera = createFullScreenPerspectiveCamera({
      position: new THREE.Vector3(0, 0.5, 2),
      lookAt: new THREE.Vector3(0, 0.5, 0),
      far: 10000,
    });

    return new PtScene(spheres, materials, camera);
  },

  Part1Final: () => {
    const spheres: PtSphere[] = [
      new PtSphere(new THREE.Vector3(0, -1000, 0), 1000, 0), // Ground
    ];
    const materials: PtMaterial[] = [
      new PtMaterial(0, new THREE.Color(0.5, 0.5, 0.5)), // Ground - Lambert
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
            materials.push(new PtMaterial(0, albedo));
            spheres.push(new PtSphere(center, 0.2, materials.length - 1));
          } else if (chooseMat < 0.95) {
            // Metal
            const albedo = new THREE.Color(
              0.5 * (1 + Math.random()),
              0.5 * (1 + Math.random()),
              0.5 * (1 + Math.random())
            );
            const fuzz = 0.5 * Math.random();
            materials.push(new PtMaterial(1, albedo, fuzz));
            spheres.push(new PtSphere(center, 0.2, materials.length - 1));
          } else {
            // Glass
            materials.push(new PtMaterial(2, new THREE.Color(1, 1, 1), 0, 1.5));
            spheres.push(new PtSphere(center, 0.2, materials.length - 1));
          }
        }
      }
    }

    materials.push(new PtMaterial(0, new THREE.Color(0.4, 0.2, 0.1))); // Center - Lambert
    spheres.push(
      new PtSphere(new THREE.Vector3(-4, 1, 0), 1.0, materials.length - 1)
    );

    materials.push(new PtMaterial(2, new THREE.Color(1, 1, 1), 0, 1.5)); // Left - Dielectric
    spheres.push(
      new PtSphere(new THREE.Vector3(0, 1, 0), 1.0, materials.length - 1)
    );

    materials.push(new PtMaterial(1, new THREE.Color(0.7, 0.6, 0.5), 0.0)); // Right - Metal
    spheres.push(
      new PtSphere(new THREE.Vector3(4, 1, 0), 1.0, materials.length - 1)
    );

    const camera = createFullScreenPerspectiveCamera({
      position: new THREE.Vector3(13, 2, 3),
      lookAt: new THREE.Vector3(0, 0, 0),
      far: 10000,
    });
    camera.fov = 20;

    return new PtScene(spheres, materials, camera);
  },

  TextureStudy: () => {
    const materials: PtMaterial[] = [
      new PtMaterial(0, checkerTexture(0x183a1d, 0xb7d66b, 16)),
      new PtMaterial(0, checkerTexture(0xf4ead5, 0xb84b3e, 12)),
      new PtMaterial(1, new THREE.Color(0xc8cbd2), 0),
      new PtMaterial(0, perlinTexture(0x101820, 0xe8dcc4, 4, 10)),
      new PtMaterial(0, imageTexture(textureStudyImage)),
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
      new PtMaterial(0, checkerTexture(0x23324a, 0xd7e3f4, 12)),
      new PtMaterial(0, imageTexture(textureStudyImage)),
      new PtMaterial(0, perlinTexture(0x6f263d, 0xf0c987, 5, 8)),
      new PtMaterial(1, new THREE.Color(0xd8dbe2), 0),
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
      new PtMaterial(
        PtMaterialType.Lambert,
        perlinTexture(0x111722, 0x8b7451, 2.5, 7)
      ),
      new PtMaterial(PtMaterialType.Lambert, new THREE.Color(0.72, 0.18, 0.08)),
      new PtMaterial(PtMaterialType.Metal, new THREE.Color(0xd8e2ee), 0),
      PtMaterial.emissive(new THREE.Color(1, 0.64, 0.28), 14),
      PtMaterial.emissive(new THREE.Color(0.2, 0.48, 1), 9, true),
    ];
    const spheres = [
      new PtSphere(new THREE.Vector3(-1.25, 0.15, -0.6), 0.65, 1),
      new PtSphere(new THREE.Vector3(0.65, 0.05, -1.1), 0.55, 2),
      new PtSphere(new THREE.Vector3(2.1, 1.15, -0.35), 0.3, 4),
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
    scene.backgroundColorTop.set(0x000000);
    scene.backgroundColorBottom.set(0x000000);
    scene.scene.background = scene.backgroundColorTop;
    return scene;
  },

  CornellBox: () => {
    const materials: PtMaterial[] = [
      new PtMaterial(PtMaterialType.Lambert, new THREE.Color(0.73, 0.73, 0.73)),
      new PtMaterial(PtMaterialType.Lambert, new THREE.Color(0.65, 0.05, 0.05)),
      new PtMaterial(PtMaterialType.Lambert, new THREE.Color(0.12, 0.45, 0.15)),
      PtMaterial.emissive(new THREE.Color(1, 0.88, 0.68), 12),
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
      ...createAxisAlignedBox(
        new THREE.Vector3(-1.05, -1.49, -0.75),
        new THREE.Vector3(-0.15, -0.15, 0.15),
        0
      ),
      ...createAxisAlignedBox(
        new THREE.Vector3(0.25, -1.49, -1.05),
        new THREE.Vector3(1.05, 0.55, -0.15),
        0
      ),
    ];
    const camera = createFullScreenPerspectiveCamera({
      position: new THREE.Vector3(0, 0, 5.4),
      lookAt: new THREE.Vector3(0, 0, 0),
      far: 10000,
    });
    camera.fov = 38;
    const scene = new PtScene([], materials, camera, quads);
    scene.backgroundColorTop.set(0x000000);
    scene.backgroundColorBottom.set(0x000000);
    scene.scene.background = scene.backgroundColorTop;
    return scene;
  },
};

function createAxisAlignedBox(
  min: THREE.Vector3,
  max: THREE.Vector3,
  materialId: number
): PtQuad[] {
  const x = max.x - min.x;
  const y = max.y - min.y;
  const z = max.z - min.z;
  return [
    new PtQuad(new THREE.Vector3(min.x, min.y, max.z), new THREE.Vector3(x, 0, 0), new THREE.Vector3(0, 0, -z), materialId),
    new PtQuad(new THREE.Vector3(min.x, max.y, min.z), new THREE.Vector3(x, 0, 0), new THREE.Vector3(0, 0, z), materialId),
    new PtQuad(new THREE.Vector3(min.x, min.y, min.z), new THREE.Vector3(x, 0, 0), new THREE.Vector3(0, y, 0), materialId),
    new PtQuad(new THREE.Vector3(min.x, min.y, max.z), new THREE.Vector3(0, 0, -z), new THREE.Vector3(0, y, 0), materialId),
    new PtQuad(new THREE.Vector3(max.x, min.y, min.z), new THREE.Vector3(0, 0, z), new THREE.Vector3(0, y, 0), materialId),
    new PtQuad(new THREE.Vector3(max.x, min.y, max.z), new THREE.Vector3(x, 0, 0).negate(), new THREE.Vector3(0, y, 0), materialId),
  ];
}
