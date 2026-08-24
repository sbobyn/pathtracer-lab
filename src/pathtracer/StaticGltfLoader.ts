import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

export interface StaticGltfPrimitive {
  geometry: THREE.BufferGeometry;
  name: string;
}

export async function loadStaticGltf(source: string): Promise<StaticGltfPrimitive[]> {
  const gltf = await new GLTFLoader().loadAsync(source);
  if (gltf.animations.length > 0) {
    throw new Error("Static glTF loading does not support animations");
  }
  return extractStaticGltfPrimitives(gltf.scene);
}

/**
 * Converts a Three.js glTF scene into independent world-space triangle
 * geometries. Materials intentionally remain outside this geometry-only slice.
 */
export function extractStaticGltfPrimitives(root: THREE.Object3D): StaticGltfPrimitive[] {
  root.updateMatrixWorld(true);
  const primitives: StaticGltfPrimitive[] = [];
  root.traverse((object) => {
    if (object instanceof THREE.SkinnedMesh) {
      throw new Error(`Static glTF loading does not support skinned mesh "${object.name || "unnamed"}"`);
    }
    if (object instanceof THREE.Line || object instanceof THREE.Points) {
      throw new Error(`Static glTF loading supports triangle mesh primitives only: "${object.name || "unnamed"}"`);
    }
    if (!(object instanceof THREE.Mesh)) return;
    if (Array.isArray(object.material)) {
      throw new Error(`Static glTF loading does not yet support multi-material mesh "${object.name || "unnamed"}"`);
    }
    if (Object.keys(object.morphTargetInfluences ?? {}).length > 0 || object.geometry.morphAttributes.position) {
      throw new Error(`Static glTF loading does not support morph targets on "${object.name || "unnamed"}"`);
    }
    const positions = object.geometry.getAttribute("position");
    if (!positions) throw new Error(`glTF mesh "${object.name || "unnamed"}" has no POSITION attribute`);
    const geometry = object.geometry.clone();
    geometry.applyMatrix4(object.matrixWorld);
    primitives.push({ geometry, name: object.name || `glTF primitive ${primitives.length}` });
  });
  if (primitives.length === 0) throw new Error("Static glTF contains no triangle mesh primitives");
  return primitives;
}
