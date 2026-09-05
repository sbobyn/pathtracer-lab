import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { createCameraDebugOutlines } from "../src/pathtracer/CameraDebugOutlines.ts";

function mesh(type: string, geometry = new THREE.BoxGeometry()) {
  const result = new THREE.Mesh(geometry);
  result.userData.pathTracer = { primitiveType: type };
  return result;
}

test("debug outlines include dense scenes in one sphere batch, including objects past 48", () => {
  const source = new THREE.SphereGeometry();
  let disposed = false;
  source.addEventListener("dispose", () => { disposed = true; });
  const meshes = Array.from({ length: 1000 }, (_, i) => {
    const sphere = mesh("sphere", source);
    sphere.position.x = i * 4;
    return sphere;
  });
  const single = createCameraDebugOutlines([meshes[0]]).children[0] as THREE.LineSegments;
  const batch = createCameraDebugOutlines(meshes);
  assert.equal(batch.children.length, 1);
  const geometry = (batch.children[0] as THREE.LineSegments).geometry;
  assert.equal(geometry.getAttribute("position").count, single.geometry.getAttribute("position").count * 1000);
  geometry.computeBoundingBox();
  assert.ok(geometry.boundingBox!.max.x > 3996);
  assert.equal(disposed, false);
});

test("debug batches preserve world transforms, colors and inherited visibility", () => {
  const box = mesh("box");
  const parent = new THREE.Group();
  parent.position.set(10, 20, 30);
  parent.add(box);
  box.scale.set(2, 4, 6);
  const hidden = mesh("sphere");
  const hiddenParent = new THREE.Group();
  hiddenParent.visible = false;
  hiddenParent.add(hidden);
  const batch = createCameraDebugOutlines([box, hidden, mesh("quad"), mesh("triangleMesh")]);
  assert.equal(batch.children.length, 3);
  const outline = batch.children[0] as THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  outline.geometry.computeBoundingBox();
  assert.deepEqual(outline.geometry.boundingBox!.min.toArray(), [9, 18, 27]);
  assert.deepEqual(outline.geometry.boundingBox!.max.toArray(), [11, 22, 33]);
  assert.equal(outline.material.color.getHex(), 0xf59e0b);
  assert.deepEqual(box.position.toArray(), [0, 0, 0]);
});
