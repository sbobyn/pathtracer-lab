import * as THREE from "three";
import type { CameraProjectionMode } from "./PtState";

export interface AuthoredCamera {
  id: string;
  name: string;
  position: [number, number, number];
  quaternion: [number, number, number, number];
  projection: CameraProjectionMode;
  fov: number;
  orthographicHeight: number;
  depthOfField: boolean;
  aperture: number;
  focusDistance: number;
  outputWidth: number;
  outputHeight: number;
}

export type AuthoredCameraInput = Omit<AuthoredCamera, "id" | "name">;

export function createAuthoredCamera(
  name: string,
  input: AuthoredCameraInput,
  id = THREE.MathUtils.generateUUID()
): AuthoredCamera {
  return { id, name: normalizedCameraName(name), ...cloneCameraInput(input) };
}

export function duplicateAuthoredCamera(
  camera: AuthoredCamera,
  name = `${camera.name} Copy`,
  id = THREE.MathUtils.generateUUID()
): AuthoredCamera {
  return createAuthoredCamera(name, camera, id);
}

export function cloneAuthoredCamera(camera: AuthoredCamera): AuthoredCamera {
  return { ...camera, position: [...camera.position], quaternion: [...camera.quaternion] };
}

export function normalizedCameraName(name: string) {
  return name.trim() || "Camera";
}

function cloneCameraInput(input: AuthoredCameraInput): AuthoredCameraInput {
  return {
    position: [...input.position],
    quaternion: [...input.quaternion],
    projection: input.projection,
    fov: input.fov,
    orthographicHeight: input.orthographicHeight,
    depthOfField: input.depthOfField,
    aperture: input.aperture,
    focusDistance: input.focusDistance,
    outputWidth: input.outputWidth,
    outputHeight: input.outputHeight,
  };
}
