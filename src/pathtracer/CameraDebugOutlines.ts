import * as THREE from "three";

/** Owned, world-space outline batches. Rebuild only when scene geometry changes. */
export function createCameraDebugOutlines(meshes: readonly THREE.Mesh[]): THREE.Group {
  const group = new THREE.Group();
  const cache = new Map<THREE.BufferGeometry, Map<number, THREE.BufferGeometry>>();
  const batches = new Map<number, { mesh: THREE.Mesh; positions: THREE.BufferAttribute | THREE.InterleavedBufferAttribute }[]>();
  let sphereOutline: THREE.BufferGeometry | undefined;
  try {
    for (const mesh of meshes) {
      let visible = true;
      mesh.traverseAncestors((parent) => { if (!parent.visible) visible = false; });
      if (!mesh.visible || !visible) continue;
      mesh.updateWorldMatrix(true, false);
      const type = mesh.userData.pathTracer.primitiveType;
      const color = type === "sphere" ? 0xc084fc : type === "quad" ? 0x38bdf8 : type === "box" ? 0xf59e0b : 0x94a3b8;
      let outline: THREE.BufferGeometry;
      if (type === "sphere") {
        if (!sphereOutline) {
          const proxy = new THREE.SphereGeometry(1, 14, 9);
          sphereOutline = new THREE.WireframeGeometry(proxy);
          proxy.dispose();
        }
        outline = sphereOutline;
      } else {
        const threshold = type === "triangleMesh" ? 1 : 24;
        let entries = cache.get(mesh.geometry);
        if (!entries) cache.set(mesh.geometry, entries = new Map());
        let edges = entries.get(threshold);
        if (!edges) {
          edges = new THREE.EdgesGeometry(mesh.geometry, threshold);
          entries.set(threshold, edges);
        }
        outline = edges;
      }
      let batch = batches.get(color);
      if (!batch) batches.set(color, batch = []);
      batch.push({ mesh, positions: outline.getAttribute("position") });
    }
    const point = new THREE.Vector3();
    for (const [color, entries] of batches) {
      const count = entries.reduce((sum, entry) => sum + entry.positions.count, 0);
      const positions = new Float32Array(count * 3);
      let offset = 0;
      for (const entry of entries) {
        for (let i = 0; i < entry.positions.count; i++) {
          point.fromBufferAttribute(entry.positions, i).applyMatrix4(entry.mesh.matrixWorld);
          point.toArray(positions, offset);
          offset += 3;
        }
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      geometry.computeBoundingSphere();
      group.add(new THREE.LineSegments(geometry,
        new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.46 })));
    }
    return group;
  } finally {
    sphereOutline?.dispose();
    for (const entries of cache.values()) for (const geometry of entries.values()) geometry.dispose();
  }
}
