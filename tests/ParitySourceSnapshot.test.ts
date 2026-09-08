import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeRawModule, decodeServedSource, sourceSnapshotDigest, isParitySourcePath } from '../scripts/parity-source-snapshot.mjs';

test('source coverage includes shader entry points as well as shader libraries', () => {
  for (const path of ['src/main.fs','src/main.vs','src/main.glsl','src/main.wgsl','src/app.ts']) assert.equal(isParitySourcePath(path), true);
  assert.equal(isParitySourcePath('src/environment.hdr'), false);
});

test('served source supports static text and rejects HTML fallbacks', () => {
  assert.equal(decodeServedSource('import type X from "x";', 'text/javascript'), 'import type X from "x";');
  assert.equal(decodeServedSource('export default "source text";'), 'source text');
  assert.throws(() => decodeServedSource('fallback', 'text/html'));
  assert.throws(() => decodeServedSource('<!doctype html><html></html>'));
});

test('raw module decoder accepts quoted text without executing trailing code', () => {
  assert.equal(decodeRawModule('export default "hello\\nworld"; throw new Error("bad")'), 'hello\nworld');
  assert.equal(decodeRawModule("export default 'it\\'s text';"), "it's text");
  assert.equal(decodeRawModule('export default `multi\nline`;'), 'multi\nline');
  assert.equal(decodeRawModule('export default `literal \\${value}`;'), 'literal ${value}');
  for (const text of ['export default `${process.exit()}`', 'export default (process.exit())', 'not a module']) assert.throws(() => decodeRawModule(text));
});

test('source snapshot digest is stable across insertion order but covers paths and contents', () => {
  assert.equal(sourceSnapshotDigest({a:'one',b:'two'}),sourceSnapshotDigest({b:'two',a:'one'}));
  assert.notEqual(sourceSnapshotDigest({a:'one'}),sourceSnapshotDigest({a:'two'}));
  assert.notEqual(sourceSnapshotDigest({a:'one'}),sourceSnapshotDigest({b:'one'}));
});
