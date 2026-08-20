import * as THREE from "three";

export function quadBounds(q: THREE.Vector3, u: THREE.Vector3, v: THREE.Vector3, padding = 1e-4) {
  const box = new THREE.Box3().setFromPoints([
    q,
    q.clone().add(u),
    q.clone().add(v),
    q.clone().add(u).add(v),
  ]);
  for (const axis of ["x", "y", "z"] as const) {
    if (box.max[axis] - box.min[axis] < padding) {
      const midpoint = (box.min[axis] + box.max[axis]) * 0.5;
      box.min[axis] = midpoint - padding * 0.5;
      box.max[axis] = midpoint + padding * 0.5;
    }
  }
  return box;
}

export function intersectQuad(
  q: THREE.Vector3,
  u: THREE.Vector3,
  v: THREE.Vector3,
  rayOrigin: THREE.Vector3,
  rayDirection: THREE.Vector3,
  minimumT = 1e-3,
  maximumT = 1e4
) {
  const crossUv = new THREE.Vector3().crossVectors(u, v);
  const crossLengthSquared = crossUv.lengthSq();
  if (crossLengthSquared < 1e-12) return null;
  const normal = crossUv.clone().normalize();
  const denominator = normal.dot(rayDirection);
  if (Math.abs(denominator) < 1e-8) return null;
  const t = normal.dot(q.clone().sub(rayOrigin)) / denominator;
  if (t <= minimumT || t >= maximumT) return null;
  const planar = rayOrigin.clone().addScaledVector(rayDirection, t).sub(q);
  const w = crossUv.multiplyScalar(1 / crossLengthSquared);
  const alpha = w.dot(new THREE.Vector3().crossVectors(planar, v));
  const beta = w.dot(new THREE.Vector3().crossVectors(u, planar));
  if (alpha < 0 || alpha > 1 || beta < 0 || beta > 1) return null;
  return { t, u: alpha, v: beta, frontFace: denominator < 0 };
}
