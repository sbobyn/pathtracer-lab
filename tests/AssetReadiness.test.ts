import assert from "node:assert/strict";
import test from "node:test";
import { AssetReadiness } from "../src/pathtracer/AssetReadiness.ts";

test("calibration waits for every current asset, without duplicate subscriptions", async () => {
  let finish!: () => void;
  const slow = new Promise<void>(resolve => { finish = resolve; });
  const fast = Promise.resolve();
  let notifications = 0;
  const gate = new AssetReadiness(() => { notifications++; });
  assert.equal(gate.ready([null]), true);
  assert.equal(gate.ready([slow, fast]), false);
  assert.equal(gate.ready([slow, fast]), false);
  await fast;
  assert.equal(gate.ready([slow, fast]), false);
  assert.equal(notifications, 1);
  finish(); await slow;
  assert.equal(gate.ready([slow, fast]), true);
  assert.equal(notifications, 2);
});

test("old scene loads do not block a new scene and failure does not hang readiness", async () => {
  const gate = new AssetReadiness(() => {});
  const pending = new Promise<void>(() => {});
  assert.equal(gate.ready([pending]), false);
  assert.equal(gate.ready([]), true);
  const failed = Promise.reject(new Error("offline"));
  assert.equal(gate.ready([failed]), false);
  await failed.catch(() => {});
  assert.equal(gate.ready([failed]), true);
});

test("settling assets cannot restart calibration after disposal", async () => {
  let finish!: () => void;
  const pending = new Promise<void>(resolve => { finish = resolve; });
  let notifications = 0;
  const gate = new AssetReadiness(() => { notifications++; });
  gate.ready([pending]);
  gate.dispose();
  finish(); await pending;
  assert.equal(notifications, 0);
});
