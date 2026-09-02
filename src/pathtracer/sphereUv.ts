export interface Direction3 {
  x: number;
  y: number;
  z: number;
}

/**
 * Equirectangular UVs matching Three.js SphereGeometry orientation:
 * +X is centered at u=0.5, the 0/1 seam lies on -X, +Y maps to v=1.
 */
export function sphereUvFromNormal(normal: Direction3) {
  const longitude = Math.atan2(-normal.z, normal.x) / (2 * Math.PI) + 0.5;
  const u = ((longitude % 1) + 1) % 1;
  const v = Math.asin(Math.min(1, Math.max(-1, normal.y))) / Math.PI + 0.5;
  return { u, v };
}

/** Dominant-axis projection onto the six faces of an imaginary cube. */
export function boxUvFromNormal(normal: Direction3) {
  const x = Math.abs(normal.x);
  const y = Math.abs(normal.y);
  const z = Math.abs(normal.z);
  let u: number;
  let v: number;
  if (x >= y && x >= z) {
    u = normal.x >= 0 ? -normal.z : normal.z;
    v = normal.y;
  } else if (y >= z) {
    u = normal.x;
    v = normal.y >= 0 ? -normal.z : normal.z;
  } else {
    u = normal.z >= 0 ? normal.x : -normal.x;
    v = normal.y;
  }
  return { u: u * 0.5 + 0.5, v: v * 0.5 + 0.5 };
}
