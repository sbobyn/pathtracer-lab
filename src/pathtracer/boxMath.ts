import * as THREE from "three";

export interface AnalyticBox {
  center: THREE.Vector3;
  halfSize: THREE.Vector3;
  axisX: THREE.Vector3;
  axisY: THREE.Vector3;
  axisZ: THREE.Vector3;
}

export function intersectBox(
  box: AnalyticBox,
  rayOrigin: THREE.Vector3,
  rayDirection: THREE.Vector3,
  minimumT = 1e-3,
  maximumT = 1e4
) {
  const relative = rayOrigin.clone().sub(box.center);
  const localOrigin = new THREE.Vector3(relative.dot(box.axisX), relative.dot(box.axisY), relative.dot(box.axisZ));
  const localDirection = new THREE.Vector3(rayDirection.dot(box.axisX), rayDirection.dot(box.axisY), rayDirection.dot(box.axisZ));
  let nearT = minimumT;
  let farT = maximumT;
  let nearAxis = -1;
  let farAxis = -1;
  let nearSign = 0;
  let farSign = 0;
  for (let axis = 0; axis < 3; axis += 1) {
    const origin = localOrigin.getComponent(axis);
    const direction = localDirection.getComponent(axis);
    const extent = box.halfSize.getComponent(axis);
    if (Math.abs(direction) < 1e-12) {
      if (origin < -extent || origin > extent) return null;
      continue;
    }
    let axisNear = (-extent - origin) / direction;
    let axisFar = (extent - origin) / direction;
    let axisNearSign = -1;
    let axisFarSign = 1;
    if (axisNear > axisFar) {
      [axisNear, axisFar] = [axisFar, axisNear];
      [axisNearSign, axisFarSign] = [axisFarSign, axisNearSign];
    }
    if (axisNear > nearT) { nearT = axisNear; nearAxis = axis; nearSign = axisNearSign; }
    if (axisFar < farT) { farT = axisFar; farAxis = axis; farSign = axisFarSign; }
    if (farT < nearT) return null;
  }
  const useNear = nearAxis >= 0 && nearT > minimumT && nearT < maximumT;
  const t = useNear ? nearT : farT;
  const axis = useNear ? nearAxis : farAxis;
  const sign = useNear ? nearSign : farSign;
  if (axis < 0 || t <= minimumT || t >= maximumT) return null;
  const localNormal = new THREE.Vector3().setComponent(axis, sign);
  const outwardNormal = box.axisX.clone().multiplyScalar(localNormal.x)
    .addScaledVector(box.axisY, localNormal.y)
    .addScaledVector(box.axisZ, localNormal.z)
    .normalize();
  return { t, normal: outwardNormal, frontFace: rayDirection.dot(outwardNormal) < 0 };
}
