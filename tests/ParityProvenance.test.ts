import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalParityJson, paritySha256 } from '../src/pathtracer/ParityProvenance.ts';

test('logical hash is stable across key order but detects geometry/material changes', async () => {
  const hash = (value: unknown) => paritySha256(new TextEncoder().encode(canonicalParityJson(value)));
  assert.equal(await hash({ x: 1, material: { ior: 1.5 } }), await hash({ material: { ior: 1.5 }, x: 1 }));
  assert.notEqual(await hash({ x: 1 }), await hash({ x: 2 }));
  assert.notEqual(await hash([1, 2]), await hash([2, 1]));
});
test('infinite attenuation is explicit and NaN fails', () => {
  assert.equal(canonicalParityJson({ distance: Infinity }), '{"distance":"+Infinity"}');
  assert.throws(() => canonicalParityJson({ value: NaN }));
});
