import * as THREE from "three";

export default class PtSphere {
  constructor(
    public position: THREE.Vector3,
    public radius: number,
    public materialId: number,
    public uvMapping: 0 | 1 = 0
  ) {}
}
