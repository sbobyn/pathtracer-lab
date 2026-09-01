declare module "troika-three-text" {
  import * as THREE from "three";

  export class Text extends THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> {
    text: string;
    fontSize: number;
    lineHeight: number | "normal";
    maxWidth: number;
    textAlign: "left" | "right" | "center" | "justify";
    anchorX: number | "left" | "center" | "right";
    anchorY: number | "top" | "top-baseline" | "middle" | "bottom-baseline" | "bottom";
    color: THREE.ColorRepresentation;
    outlineColor: THREE.ColorRepresentation;
    outlineWidth: number | string;
    sync(callback?: () => void): void;
    dispose(): void;
  }
}
