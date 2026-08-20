import * as THREE from "three";
import { quadBounds } from "./quadMath";

/** A bounded parallelogram: Q + aU + bV, where a and b are in [0, 1]. */
export default class PtQuad {
  constructor(
    public q: THREE.Vector3,
    public u: THREE.Vector3,
    public v: THREE.Vector3,
    public materialId: number
  ) {}

  public boundingBox(padding = 1e-4) {
    return quadBounds(this.q, this.u, this.v, padding);
  }
}
