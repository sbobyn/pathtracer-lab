import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { packSphereTexture } from "../src/pathtracer/PackedSphereTexture.ts";

test("packed sphere data preserves geometry, material, and UV mapping", () => {
  const packed = packSphereTexture([{
    position: new THREE.Vector3(1, 2, 3),
    radius: 0.75,
    materialId: 9,
    uvMapping: 1,
  }], 16);
  const data = packed.texture.image.data as Float32Array;
  assert.deepEqual(Array.from(data.slice(0, 8)), [1, 2, 3, 0.75, 9, 1, 0, 0]);
  assert.deepEqual(packed.size.toArray(), [2, 1]);
  packed.texture.dispose();
});

test("packed sphere storage wraps rows and rejects capacity overflow", () => {
  const spheres = Array.from({ length: 4 }, (_, index) => ({
    position: new THREE.Vector3(index, 0, 0),
    radius: 0.5,
    materialId: index,
    uvMapping: 0,
  }));
  const packed = packSphereTexture(spheres, 4);
  assert.deepEqual(packed.size.toArray(), [4, 2]);
  packed.texture.dispose();
  assert.throws(() => packSphereTexture(spheres, 2), /capacity exceeded/);
});
