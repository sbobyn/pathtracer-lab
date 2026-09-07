import assert from "node:assert/strict";
import test from "node:test";
import { AssetTransfer, getAssetTransfer, trackAssetTransfer } from "../src/pathtracer/AssetLoadProgress.ts";

const event = (loaded: number, total: number, lengthComputable = true) =>
  ({ loaded, total, lengthComputable }) as ProgressEvent;

test("reports real transfer percentages and marks completed downloads for preparation", () => {
  const transfer = new AssetTransfer();
  assert.equal(transfer.percent, undefined);
  transfer.update(event(25, 100));
  assert.equal(transfer.percent, 25);
  transfer.update(event(100, 100));
  assert.equal(transfer.percent, 100);
  transfer.update(event(120, 100));
  assert.equal(transfer.percent, 100);
});

test("unknown download lengths remain indeterminate while retaining byte counts", () => {
  const transfer = new AssetTransfer();
  transfer.update(event(2048, 0));
  assert.equal(transfer.percent, undefined);
  assert.equal(transfer.loaded, 2048);
  transfer.update(event(2048, 4096, false));
  assert.equal(transfer.percent, undefined);
});

test("stale loads cannot change the transfer associated with their replacement", () => {
  const old = new AssetTransfer();
  const current = new AssetTransfer();
  const first = trackAssetTransfer(Promise.resolve(), old);
  const second = trackAssetTransfer(Promise.resolve(), current);
  old.update(event(100, 100));
  assert.equal(getAssetTransfer(first)?.percent, 100);
  assert.equal(getAssetTransfer(second)?.percent, undefined);
  assert.equal(getAssetTransfer(null), undefined);
});
