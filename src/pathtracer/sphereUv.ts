export interface Direction3 {
  x: number;
  y: number;
  z: number;
}

/**
 * Equirectangular UVs matching Three.js SphereGeometry orientation:
 * +X is centered at u=0.5, the seam lies on -X, +Y maps to v=1.
 */
export function sphereUvFromNormal(normal: Direction3) {
  const u = Math.atan2(normal.z, normal.x) / (2 * Math.PI) + 0.5;
  const v = Math.asin(Math.min(1, Math.max(-1, normal.y))) / Math.PI + 0.5;
  return { u, v };
}
