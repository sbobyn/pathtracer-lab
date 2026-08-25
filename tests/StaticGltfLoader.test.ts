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

test("static glTF extraction preserves indexed attributes across multiple meshes", () => {
  const root = new THREE.Group();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute([
    0, 0, 0, 1, 0, 0, 0, 1, 0,
  ], 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute([
    0, 0, 1, 0, 0, 1, 0, 0, 1,
  ], 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute([
    0, 0, 1, 0, 0, 1,
  ], 2));
  geometry.setIndex([0, 1, 2]);
  const first = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
  first.name = "first";
  const second = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
  second.name = "second";
  second.position.x = 3;
  root.add(first, second);

  const primitives = extractStaticGltfPrimitives(root);
  assert.equal(primitives.length, 2);
  assert.equal(primitives[0]!.geometry.index!.count, 3);
  assert.equal(primitives[0]!.geometry.getAttribute("normal").count, 3);
  assert.equal(primitives[0]!.geometry.getAttribute("uv").count, 3);
  assert.equal(primitives[1]!.geometry.getAttribute("position").getX(0), 3);
  assert.equal(primitives[0]!.material, first.material);
});

test("static glTF extraction splits material groups into independent primitives", () => {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute([
    0, 0, 0, 1, 0, 0, 0, 1, 0,
    1, 0, 0, 1, 1, 0, 0, 1, 0,
  ], 3));
  geometry.setIndex([0, 1, 2, 3, 4, 5]);
  geometry.addGroup(0, 3, 0);
  geometry.addGroup(3, 3, 1);
  const firstMaterial = new THREE.MeshStandardMaterial({ color: 0xff0000 });
  const secondMaterial = new THREE.MeshStandardMaterial({ color: 0x00ff00 });
  const root = new THREE.Group();
  root.add(new THREE.Mesh(geometry, [firstMaterial, secondMaterial]));

  const primitives = extractStaticGltfPrimitives(root);
  assert.equal(primitives.length, 2);
  assert.deepEqual(Array.from(primitives[0]!.geometry.index!.array), [0, 1, 2]);
  assert.deepEqual(Array.from(primitives[1]!.geometry.index!.array), [3, 4, 5]);
  assert.equal(primitives[0]!.material, firstMaterial);
  assert.equal(primitives[1]!.material, secondMaterial);
});

test("static glTF extraction rejects unsupported content explicitly", () => {
  const empty = new THREE.Group();
  assert.throws(() => extractStaticGltfPrimitives(empty), /no triangle mesh/);
  const root = new THREE.Group();
  root.add(new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial()));
  assert.throws(() => extractStaticGltfPrimitives(root), /triangle mesh primitives only/);
});
