import * as THREE from "three";

export interface TriangleIntersection {
  t: number;
  barycentrics: THREE.Vector3;
  geometricNormal: THREE.Vector3;
  frontFace: boolean;
}

/** CPU reference for the two-sided Möller–Trumbore test used in GLSL. */
export function intersectTriangle(
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  a: THREE.Vector3,
  b: THREE.Vector3,
  c: THREE.Vector3,
  tMin = 1e-4,
  tMax = Number.POSITIVE_INFINITY
): TriangleIntersection | null {
  const edgeAB = b.clone().sub(a);
  const edgeAC = c.clone().sub(a);
  const p = new THREE.Vector3().crossVectors(direction, edgeAC);
  const determinant = edgeAB.dot(p);
  if (Math.abs(determinant) < 1e-8) return null;
  const inverseDeterminant = 1 / determinant;
  const fromA = origin.clone().sub(a);
  const baryB = fromA.dot(p) * inverseDeterminant;
  if (baryB < 0 || baryB > 1) return null;
  const q = new THREE.Vector3().crossVectors(fromA, edgeAB);
  const baryC = direction.dot(q) * inverseDeterminant;
  if (baryC < 0 || baryB + baryC > 1) return null;
  const t = edgeAC.dot(q) * inverseDeterminant;
  if (!(tMin < t && t < tMax)) return null;
  const geometricNormal = new THREE.Vector3().crossVectors(edgeAB, edgeAC).normalize();
  const frontFace = direction.dot(geometricNormal) < 0;
  return {
    t,
    barycentrics: new THREE.Vector3(1 - baryB - baryC, baryB, baryC),
    geometricNormal: frontFace ? geometricNormal : geometricNormal.negate(),
    frontFace,
  };
}
