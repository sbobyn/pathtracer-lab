import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import {
  buildEnvironmentImportanceDistribution,
  dominantEnvironmentDirection,
} from "../src/pathtracer/EnvironmentImportanceDistribution.ts";

function texture(data: Float32Array, width: number, height: number) {
  return new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.FloatType);
}

test("dominant environment direction follows the brightest texel and rotation", () => {
  const data = new Float32Array(4 * 2 * 4);
  data.fill(0);
  for (let pixel = 0; pixel < 8; pixel++) data[pixel * 4 + 3] = 1;
  const bright = (1 * 4 + 2) * 4;
  data[bright] = data[bright + 1] = data[bright + 2] = 100;
  const map = texture(data, 4, 2);
  const direction = dominantEnvironmentDirection(map);
  assert.ok(Math.abs(direction.x - 0.5) < 1e-6);
  assert.ok(Math.abs(direction.y + Math.SQRT1_2) < 1e-6);
  assert.ok(Math.abs(direction.z - 0.5) < 1e-6);
  const rotated = dominantEnvironmentDirection(map, 90);
  assert.ok(Math.abs(rotated.x - 0.5) < 1e-6);
  assert.ok(Math.abs(rotated.z + 0.5) < 1e-6);
});

test("environment distribution normalizes its marginal and conditional CDFs", () => {
  const distribution = buildEnvironmentImportanceDistribution(texture(new Float32Array([
    1, 1, 1, 1, 2, 2, 2, 1,
    3, 3, 3, 1, 4, 4, 4, 1,
  ]), 2, 2));
  const conditional = distribution.conditional.image.data as Float32Array;
  const marginal = distribution.marginal.image.data as Float32Array;
  assert.equal(conditional[4], 1);
  assert.equal(conditional[12], 1);
  assert.equal(marginal[4], 1);
});

test("environment distribution favors bright texels", () => {
  const data = new Float32Array(4 * 2 * 4).fill(0);
  for (let i = 0; i < 8; i++) data[i * 4 + 3] = 1;
  data[(1 * 4 + 2) * 4] = 100;
  data[(1 * 4 + 2) * 4 + 1] = 100;
  data[(1 * 4 + 2) * 4 + 2] = 100;
  const distribution = buildEnvironmentImportanceDistribution(texture(data, 4, 2));
  const conditional = distribution.conditional.image.data as Float32Array;
  const brightProbability = conditional[(1 * 4 + 2) * 4 + 1];
  assert.ok(brightProbability > 0.99);
});

test("equal radiance rows are weighted by spherical solid angle", () => {
  const data = new Float32Array(4 * 4 * 4).fill(1);
  const distribution = buildEnvironmentImportanceDistribution(texture(data, 4, 4));
  const marginal = distribution.marginal.image.data as Float32Array;
  const polarProbability = marginal[1];
  const equatorialProbability = marginal[5];
  assert.ok(equatorialProbability > polarProbability);
  assert.ok(Math.abs(marginal[12] - 1) < 1e-6);
});

test("downsampling preserves a bright source pixel instead of center-sampling past it", () => {
  const width = 1024;
  const data = new Float32Array(width * 4);
  data[0] = 100;
  data[1] = 100;
  data[2] = 100;
  const distribution = buildEnvironmentImportanceDistribution(texture(data, width, 1));
  assert.equal(distribution.size.x, 512);
  const conditional = distribution.conditional.image.data as Float32Array;
  assert.ok(conditional[1] > 0.99);
});
