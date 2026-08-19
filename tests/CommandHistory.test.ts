import assert from "node:assert/strict";
import test from "node:test";
import CommandHistory from "../src/pathtracer/CommandHistory.ts";

function valueCommand(
  label: string,
  target: { value: number },
  before: number,
  after: number
) {
  return {
    label,
    execute: () => {
      target.value = after;
    },
    undo: () => {
      target.value = before;
    },
  };
}

test("undo, redo, and labels describe the next available operation", () => {
  const target = { value: 0 };
  const history = new CommandHistory();
  history.execute(valueCommand("Move sphere", target, 0, 3));

  assert.equal(target.value, 3);
  assert.deepEqual(history.getSnapshot(), {
    canUndo: true,
    canRedo: false,
    undoLabel: "Move sphere",
    redoLabel: null,
  });

  assert.equal(history.undo(), true);
  assert.equal(target.value, 0);
  assert.equal(history.getSnapshot().redoLabel, "Move sphere");

  assert.equal(history.redo(), true);
  assert.equal(target.value, 3);
});

test("a new edit after undo clears the redo branch", () => {
  const target = { value: 0 };
  const history = new CommandHistory();
  history.execute(valueCommand("First", target, 0, 1));
  history.undo();
  history.execute(valueCommand("Replacement", target, 0, 2));

  assert.equal(history.redo(), false);
  assert.equal(history.getSnapshot().undoLabel, "Replacement");
});

test("record coalesces an already-applied continuous edit into one entry", () => {
  const target = { value: 0 };
  const history = new CommandHistory();

  // A pointer drag may update authoritative state many times. Only its final
  // before/after command is recorded when the drag ends.
  target.value = 1;
  target.value = 2;
  target.value = 3;
  history.record(valueCommand("Drag sphere", target, 0, 3));

  history.undo();
  assert.equal(target.value, 0);
  assert.equal(history.undo(), false);
});

test("canceling a preview leaves no history entry", () => {
  const target = { value: 0 };
  const history = new CommandHistory();
  const before = target.value;

  target.value = 8;
  target.value = before;

  assert.equal(history.undo(), false);
  assert.equal(target.value, 0);
});

test("deletion restores object identity and redo repeats invalidation", () => {
  const first = { id: "first" };
  const removed = { id: "removed" };
  const objects = [first, removed];
  const history = new CommandHistory();
  let invalidations = 0;
  const remove = () => {
    objects.splice(objects.indexOf(removed), 1);
    invalidations += 1;
  };
  const restore = () => {
    objects.splice(1, 0, removed);
    invalidations += 1;
  };

  history.execute({ label: "Remove object", execute: remove, undo: restore });
  assert.deepEqual(objects, [first]);
  history.undo();
  assert.equal(objects[1], removed);
  history.redo();
  assert.deepEqual(objects, [first]);
  assert.equal(invalidations, 3);
});

test("history is bounded", () => {
  const target = { value: 0 };
  const history = new CommandHistory(2);
  history.execute(valueCommand("One", target, 0, 1));
  history.execute(valueCommand("Two", target, 1, 2));
  history.execute(valueCommand("Three", target, 2, 3));

  history.undo();
  history.undo();
  assert.equal(history.undo(), false);
  assert.equal(target.value, 1);
});
