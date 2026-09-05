import * as THREE from "three";

interface SceneBackgroundColors {
  backgroundColorTop: THREE.Color;
  backgroundColorBottom: THREE.Color;
  scene: THREE.Scene;
  dirLight: THREE.DirectionalLight;
}

/** Keep the authoritative colors used by uniforms and offline snapshots in sync. */
export function setSceneGradientColor(
  scene: SceneBackgroundColors,
  edge: "top" | "bottom",
  value: THREE.ColorRepresentation,
  gradientVisible: boolean
): THREE.Color {
  const color = edge === "top" ? scene.backgroundColorTop : scene.backgroundColorBottom;
  color.set(value);
  if (edge === "top" && gradientVisible) {
    scene.scene.background = color;
    scene.dirLight.color.copy(color);
  }
  return color;
}
