import assert from "node:assert/strict";
import test from "node:test";
import { embedPngText } from "../src/pathtracer/PngMetadata.ts";

test("PNG export metadata is inserted before the terminal IEND chunk", async () => {
  const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const iend = new Uint8Array([0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130]);
  const output = new Uint8Array(await (await embedPngText(
    new Blob([signature, iend], { type: "image/png" }),
    "Pathtracer Lab",
    '{"scene":"Study"}'
  )).arrayBuffer());
  const text = new TextDecoder().decode(output);
  assert.equal(text.includes("tEXtPathtracer Lab\0{\"scene\":\"Study\"}"), true);
  assert.deepEqual([...output.subarray(-12)], [...iend]);
});
