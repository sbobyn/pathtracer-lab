import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

export interface StaticGltfPrimitive {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
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
    if (Object.keys(object.morphTargetInfluences ?? {}).length > 0 || object.geometry.morphAttributes.position) {
      throw new Error(`Static glTF loading does not support morph targets on "${object.name || "unnamed"}"`);
    }
    const positions = object.geometry.getAttribute("position");
    if (!positions) throw new Error(`glTF mesh "${object.name || "unnamed"}" has no POSITION attribute`);
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    const groups: Array<{ start: number; count: number; materialIndex?: number }> = Array.isArray(object.material)
      ? object.geometry.groups
      : [{ start: 0, count: object.geometry.index?.count ?? positions.count, materialIndex: 0 }];
    if (groups.length === 0) {
      throw new Error(`Multi-material glTF mesh "${object.name || "unnamed"}" has no primitive groups`);
    }
    groups.forEach((group, groupIndex) => {
      const material = materials[group.materialIndex ?? 0];
      if (!material) {
        throw new Error(`glTF mesh "${object.name || "unnamed"}" references missing material ${group.materialIndex}`);
      }
      const geometry = extractGeometryRange(object.geometry, group.start, group.count);
      geometry.applyMatrix4(object.matrixWorld);
      primitives.push({
        geometry,
        material,
        name: object.name
          ? `${object.name}${groups.length > 1 ? ` · primitive ${groupIndex + 1}` : ""}`
          : `glTF primitive ${primitives.length}`,
      });
    });
  });
  if (primitives.length === 0) throw new Error("Static glTF contains no triangle mesh primitives");
  return primitives;
}

function extractGeometryRange(
  source: THREE.BufferGeometry,
  start: number,
  count: number
): THREE.BufferGeometry {
  if (source.index) {
    const geometry = source.clone();
    const indices = source.index.array.slice(start, start + count);
    geometry.setIndex(new THREE.BufferAttribute(indices, 1, source.index.normalized));
    geometry.clearGroups();
    return geometry;
  }
  const geometry = new THREE.BufferGeometry();
  for (const name of ["position", "normal", "uv"]) {
    const attribute = source.getAttribute(name);
    if (!attribute) continue;
    const values = new Float32Array(count * attribute.itemSize);
    for (let vertex = 0; vertex < count; vertex++) {
      const sourceVertex = start + vertex;
      const target = vertex * attribute.itemSize;
      values[target] = attribute.getX(sourceVertex);
      if (attribute.itemSize > 1) values[target + 1] = attribute.getY(sourceVertex);
      if (attribute.itemSize > 2) values[target + 2] = attribute.getZ(sourceVertex);
      if (attribute.itemSize > 3) values[target + 3] = attribute.getW(sourceVertex);
    }
    geometry.setAttribute(name, new THREE.Float32BufferAttribute(values, attribute.itemSize));
  }
  return geometry;
}
