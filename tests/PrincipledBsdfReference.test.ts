import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import {
  dielectricF0,
  evaluatePrincipledBsdf,
  principledBsdfPdf,
  samplePrincipledBsdf,
  type PrincipledBsdfParameters,
} from "../src/pathtracer/PrincipledBsdfReference.ts";

const normal = new THREE.Vector3(0, 0, 1);
const view = new THREE.Vector3(0.2, 0.1, 1).normalize();

function parameters(metallic: number, roughness: number): PrincipledBsdfParameters {
  return { baseColor: new THREE.Color(0.8, 0.35, 0.1), metallic, roughness, ior: 1.5 };
}

test("IOR-derived dielectric reflectance matches the normal-incidence formula", () => {
  assert.ok(Math.abs(dielectricF0(1.5) - 0.04) < 1e-12);
});

test("principled evaluation remains finite across representative material parameters", () => {
  for (const metallic of [0, 0.25, 0.5, 0.75, 1]) {
    for (const roughness of [0, 0.1, 0.35, 0.7, 1]) {
      for (const direction of [
        new THREE.Vector3(0, 0, 1),
        new THREE.Vector3(0.8, 0, 0.6).normalize(),
        new THREE.Vector3(-0.3, 0.9, 0.2).normalize(),
      ]) {
        const value = evaluatePrincipledBsdf(parameters(metallic, roughness), normal, view, direction);
        assert.ok([value.r, value.g, value.b].every((channel) => Number.isFinite(channel) && channel >= 0));
        const pdf = principledBsdfPdf(parameters(metallic, roughness), normal, view, direction);
        assert.ok(Number.isFinite(pdf) && pdf >= 0);
      }
    }
  }
});

test("sampling returns the PDF and BSDF reported by the matching evaluators", () => {
  const material = parameters(0.6, 0.32);
  const samples = [
    [0.05, 0.13, 0.77],
    [0.45, 0.61, 0.21],
    [0.95, 0.37, 0.89],
  ] as const;
  for (const [strategy, x, y] of samples) {
    const sampled = samplePrincipledBsdf(material, normal, view, strategy, new THREE.Vector2(x, y));
    if (!sampled.valid) continue;
    const expectedPdf = principledBsdfPdf(material, normal, view, sampled.direction);
    const expectedValue = evaluatePrincipledBsdf(material, normal, view, sampled.direction);
    assert.ok(Math.abs(sampled.pdf - expectedPdf) < 1e-12);
    assert.ok(sampled.value.toArray().every((channel, index) =>
      Math.abs(channel - expectedValue.toArray()[index]!) < 1e-12
    ));
  }
});

test("hemispherical reflectance does not show obvious energy gain", () => {
  const sampleCount = 4096;
  for (const metallic of [0, 0.5, 1]) {
    for (const roughness of [0.08, 0.3, 0.7, 1]) {
      const material = parameters(metallic, roughness);
      const sum = new THREE.Color(0, 0, 0);
      for (let index = 0; index < sampleCount; index += 1) {
        const u = (index + 0.5) / sampleCount;
        const v = radicalInverse(index);
        const z = u;
        const radius = Math.sqrt(Math.max(0, 1 - z * z));
        const direction = new THREE.Vector3(
          radius * Math.cos(2 * Math.PI * v),
          radius * Math.sin(2 * Math.PI * v),
          z
        );
        sum.add(evaluatePrincipledBsdf(material, normal, normal, direction).multiplyScalar(z));
      }
      sum.multiplyScalar(2 * Math.PI / sampleCount);
      assert.ok(Math.max(sum.r, sum.g, sum.b) <= 1.05, `${metallic}/${roughness}: ${sum.toArray()}`);
    }
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
