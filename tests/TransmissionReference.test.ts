import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import {
  dielectricFresnel,
  directShadowVisibility,
  dispersionIors,
  roughDielectricPdf,
  sampleRoughDielectric,
  updateMediumStack,
  volumeAttenuation,
} from "../src/pathtracer/TransmissionReference.ts";

test("Beer-Lambert attenuation reaches the authored color at its reference distance", () => {
  const color = new THREE.Color(0.25, 0.5, 0.8);
  assert.ok(volumeAttenuation(color, 2, 2).equals(color));
  const doubled = volumeAttenuation(color, 2, 4);
  assert.ok(doubled.equals(new THREE.Color(0.25 ** 2, 0.5 ** 2, 0.8 ** 2)));
  assert.ok(volumeAttenuation(color, Infinity, 100).equals(new THREE.Color(1, 1, 1)));
});

test("nested volume boundaries push and pop while thin walls leave no medium", () => {
  let stack = updateMediumStack([], 4, true, true, 0);
  assert.deepEqual(stack, []);
  stack = updateMediumStack(stack, 4, true, true, 0.5);
  stack = updateMediumStack(stack, 7, true, true, 0.25);
  assert.deepEqual(stack, [4, 7]);
  stack = updateMediumStack(stack, 7, false, true, 0.25);
  stack = updateMediumStack(stack, 4, false, true, 0.5);
  assert.deepEqual(stack, []);
});

test("reflection and mismatched exits do not corrupt the active medium", () => {
  assert.deepEqual(updateMediumStack([2], 2, false, false, 1), [2]);
  assert.deepEqual(updateMediumStack([2, 3], 2, false, true, 1), [2, 3]);
  assert.deepEqual(updateMediumStack([1, 2, 3, 4], 5, true, true, 1), [1, 2, 3, 4]);
});

test("total internal reflection is explicit for a dense-to-air boundary", () => {
  const sample = sampleRoughDielectric(
    new THREE.Vector3(0, 0, 1),
    new THREE.Vector3(0.98, 0, 0.2).normalize(),
    0.045,
    1.5,
    1,
    new THREE.Vector2(0, 0),
    1
  );
  assert.equal(dielectricFresnel(0.2, 1.5, 1), 1);
  assert.equal(sample.totalInternalReflection, true);
  assert.equal(sample.transmitted, false);
  assert.ok(sample.valid);
});

test("rough dielectric samples report the matching finite PDF", () => {
  const normal = new THREE.Vector3(0, 0, 1);
  const view = new THREE.Vector3(0.25, -0.1, 1).normalize();
  for (const [x, y, fresnel] of [
    [0.12, 0.73, 0.99],
    [0.47, 0.21, 0.99],
    [0.81, 0.56, 0.0],
  ] as const) {
    const sample = sampleRoughDielectric(
      normal, view, 0.32, 1, 1.5, new THREE.Vector2(x, y), fresnel
    );
    assert.ok(sample.valid);
    const expected = roughDielectricPdf(
      normal, view, sample.direction, 0.32, 1, 1.5
    );
    assert.ok(Math.abs(sample.pdf - expected) < 1e-12);
  }
});

test("Khronos dispersion spreads red below and blue above the green IOR", () => {
  assert.deepEqual(dispersionIors(1.5, 0).toArray(), [1.5, 1.5, 1.5]);
  const iors = dispersionIors(1.5, 1);
  assert.ok(iors.x < iors.y && iors.y < iors.z);
  assert.ok(Math.abs(iors.y - 1.5) < 1e-12);
  assert.ok(Math.abs((iors.z - iors.x) - 0.025) < 1e-12);
});

test("direct-light shadow visibility uses the documented opaque-boundary contract", () => {
  assert.equal(directShadowVisibility(0), 1);
  assert.equal(directShadowVisibility(1), 0);
  assert.equal(directShadowVisibility(3), 0);
});

test("rough transmission PDFs produce finite MIS weights", () => {
  const normal = new THREE.Vector3(0, 0, 1);
  const view = new THREE.Vector3(0.15, 0.05, 1).normalize();
  for (let index = 0; index < 128; index++) {
    const sample = sampleRoughDielectric(
      normal,
      view,
      0.45,
      1,
      1.5,
      new THREE.Vector2((index + 0.5) / 128, radicalInverse(index)),
      radicalInverse(index + 31)
    );
    if (!sample.valid) continue;
    const lightPdf = 0.01 + radicalInverse(index + 7);
    const denominator = sample.pdf * sample.pdf + lightPdf * lightPdf;
    const weight = sample.pdf * sample.pdf / denominator;
    assert.ok(Number.isFinite(weight) && weight >= 0 && weight <= 1);
  }
});

function radicalInverse(value: number): number {
  let bits = value;
  let result = 0;
  let factor = 0.5;
  while (bits > 0) {
    result += factor * (bits & 1);
    bits >>>= 1;
    factor *= 0.5;
  }
  return result;
}
