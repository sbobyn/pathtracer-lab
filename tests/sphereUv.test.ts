import assert from "node:assert/strict";
import test from "node:test";
import { sphereUvFromNormal } from "../src/pathtracer/sphereUv.ts";

function assertUv(
  direction: { x: number; y: number; z: number },
  expected: { u: number; v: number }
) {
  const actual = sphereUvFromNormal(direction);
  assert.ok(Math.abs(actual.u - expected.u) < 1e-12);
  assert.ok(Math.abs(actual.v - expected.v) < 1e-12);
}

test("sphere UVs use +X as the horizontal center and -X as the seam", () => {
  assertUv({ x: 1, y: 0, z: 0 }, { u: 0.5, v: 0.5 });
  assertUv({ x: 0, y: 0, z: 1 }, { u: 0.75, v: 0.5 });
  assertUv({ x: 0, y: 0, z: -1 }, { u: 0.25, v: 0.5 });
  assertUv({ x: -1, y: 0, z: 0 }, { u: 1, v: 0.5 });
});

test("sphere UVs map the poles to the vertical range", () => {
  assertUv({ x: 0, y: 1, z: 0 }, { u: 0.5, v: 1 });
  assertUv({ x: 0, y: -1, z: 0 }, { u: 0.5, v: 0 });
});
