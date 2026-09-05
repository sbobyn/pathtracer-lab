import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { createFullScreenPerspectiveCamera } from "../src/utils/createFullscreenCamera.ts";

test("portrait preset framing preserves horizontal coverage and authored target", () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  try {
    const target = new THREE.Vector3(0.25, 0.45, -0.65);
    const position = new THREE.Vector3(0, 1.7, 5.6);
    Object.defineProperty(globalThis, "window", { configurable: true, value: { innerWidth: 390, innerHeight: 844 } });
    const camera = createFullScreenPerspectiveCamera({ position, lookAt: target, fov: 45 });
    assert.deepEqual(camera.userData.orbitTarget, target.toArray());
    const distance = camera.position.distanceTo(target);
    assert.ok(Math.abs(distance * camera.aspect - position.distanceTo(target)) < 1e-8);
    assert.ok(camera.getWorldDirection(new THREE.Vector3()).distanceTo(target.clone().sub(camera.position).normalize()) < 1e-8);
    Object.defineProperty(globalThis, "window", { configurable: true, value: { innerWidth: 1200, innerHeight: 800 } });
    const desktop = createFullScreenPerspectiveCamera({ position, lookAt: target });
    assert.deepEqual(desktop.position.toArray(), position.toArray());
  } finally {
    if (previous) Object.defineProperty(globalThis, "window", previous);
    else Reflect.deleteProperty(globalThis, "window");
  }
});
