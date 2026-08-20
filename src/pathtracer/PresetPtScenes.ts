import * as THREE from "three";
import PtScene from "./PtScene";
import PtSphere from "./PtSphere";
import PtMaterial from "./PtMaterial";
import { createFullScreenPerspectiveCamera } from "../utils/createFullscreenCamera";
import { checkerTexture, imageTexture, perlinTexture } from "./PtTexture";
import textureStudyImage from "../assets/texture-study.svg?url";

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
};
