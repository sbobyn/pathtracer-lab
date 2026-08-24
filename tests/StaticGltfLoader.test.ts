import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { extractStaticGltfPrimitives } from "../src/pathtracer/StaticGltfLoader.ts";

test("static glTF extraction bakes nested world transforms", () => {
  const root = new THREE.Group();
  root.position.set(5, 0, 0);
  const nested = new THREE.Group();
  nested.position.set(0, 2, 0);
  const mesh = new THREE.Mesh(new THREE.BufferGeometry().setAttribute(
    "position",
    new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3)
  ), new THREE.MeshBasicMaterial());
  nested.add(mesh);
  root.add(nested);
  const [primitive] = extractStaticGltfPrimitives(root);
  const positions = primitive!.geometry.getAttribute("position");
  assert.deepEqual([positions.getX(0), positions.getY(0), positions.getZ(0)], [5, 2, 0]);
});

test("static glTF extraction rejects unsupported content explicitly", () => {
  const empty = new THREE.Group();
  assert.throws(() => extractStaticGltfPrimitives(empty), /no triangle mesh/);
  const root = new THREE.Group();
  root.add(new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial()));
  assert.throws(() => extractStaticGltfPrimitives(root), /triangle mesh primitives only/);
});
