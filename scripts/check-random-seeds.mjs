import assert from "node:assert/strict";

const viewportWidth = 1728;
const largeFrameIndex = 20_000;
const modulusX = 65_521;
const modulusY = 65_519;

function oldSeedX(pixelX, frameIndex) {
  const ndcX = Math.fround(
    Math.fround((pixelX + 0.5) / viewportWidth) * 2 - 1
  );
  const temporal = Math.fround(Math.fround(frameIndex) * 7.777);
  return Math.fround(ndcX + temporal);
}

function boundedSeedX(pixelX, temporalOffset) {
  return Math.fround(Math.fround(pixelX + 0.5) + temporalOffset);
}

function randomSequenceState(frameIndex) {
  return [frameIndex % modulusX, frameIndex % modulusY];
}

const oldInputs = new Set();
const boundedInputs = new Set();
const representativeBoundedOffset = Math.fround(4095.75);

for (let pixelX = 0; pixelX < viewportWidth; pixelX++) {
  oldInputs.add(oldSeedX(pixelX, largeFrameIndex));
  boundedInputs.add(boundedSeedX(pixelX, representativeBoundedOffset));
}

assert.ok(
  oldInputs.size < viewportWidth,
  "The accelerated legacy case should demonstrate collapsed neighboring inputs."
);
assert.equal(
  boundedInputs.size,
  viewportWidth,
  "Integer-like pixel coordinates must remain distinct across the bounded seed domain."
);

const initialState = randomSequenceState(largeFrameIndex);
assert.notDeepEqual(
  initialState,
  randomSequenceState(largeFrameIndex + modulusX),
  "The second component must prevent a repeat after the first modulus."
);
assert.notDeepEqual(
  initialState,
  randomSequenceState(largeFrameIndex + modulusY),
  "The first component must prevent a repeat after the second modulus."
);

console.log(
  `RNG precision check passed: legacy seed retained ${oldInputs.size}/${viewportWidth} distinct horizontal pixel inputs at frame ${largeFrameIndex}; bounded seed retained ${boundedInputs.size}/${viewportWidth}.`
);
