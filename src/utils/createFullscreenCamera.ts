import * as THREE from "three";

export function createFullScreenPerspectiveCamera({
  fov = 75,
  near = 0.1,
  far = 100,
  lookAt = new THREE.Vector3(0, 0, 0),
  position = new THREE.Vector3(1, 1, 1),
}: {
  fov?: number;
  near?: number;
  far?: number;
  lookAt?: THREE.Vector3;
  position?: THREE.Vector3;
} = {}): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(
    fov,
    window.innerWidth / window.innerHeight,
    near,
    far
  );
  camera.position.copy(position);
  camera.lookAt(lookAt);

  return camera;
}

export function createFullScreenOrthographicCamera({
  frustumSize = 2,
  near = 0.1,
  far = 100,
  position = new THREE.Vector3(1, 1, 1),
  lookAt = new THREE.Vector3(0, 0, 0),
}: {
  frustumSize?: number;
  near?: number;
  far?: number;
  position?: THREE.Vector3;
  lookAt?: THREE.Vector3;
} = {}): THREE.OrthographicCamera {
  const aspect = window.innerWidth / window.innerHeight;

  const camera = new THREE.OrthographicCamera(
    (-frustumSize * aspect) / 2,
    (frustumSize * aspect) / 2,
    frustumSize / 2,
    -frustumSize / 2,
    near,
    far
  );

  camera.position.copy(position);
  camera.lookAt(lookAt);

  return camera;
}
