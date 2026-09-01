import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

type GlbJson = {
  extensionsUsed?: string[];
  materials?: Array<{ extensions?: Record<string, unknown> }>;
};

async function readGlbJson(name: string): Promise<GlbJson> {
  const bytes = await readFile(new URL(`../src/assets/gltf/khronos-pbr/${name}.glb`, import.meta.url));
  assert.equal(bytes.subarray(0, 4).toString("ascii"), "glTF");
  assert.equal(bytes.readUInt32LE(4), 2);
  const jsonLength = bytes.readUInt32LE(12);
  assert.equal(bytes.readUInt32LE(16), 0x4e4f534a);
  return JSON.parse(bytes.subarray(20, 20 + jsonLength).toString("utf8")) as GlbJson;
}

const requiredByAsset: Record<string, string[]> = {
  CompareTransmission: ["KHR_materials_transmission"],
  CompareVolume: ["KHR_materials_transmission", "KHR_materials_volume"],
  DispersionTest: [
    "KHR_materials_transmission",
    "KHR_materials_volume",
    "KHR_materials_ior",
    "KHR_materials_dispersion",
  ],
};

for (const [asset, requiredExtensions] of Object.entries(requiredByAsset)) {
  test(`${asset} is an official focused glTF material reference`, async () => {
    const gltf = await readGlbJson(asset);
    for (const extension of requiredExtensions) {
      assert.ok(gltf.extensionsUsed?.includes(extension), `${asset} must declare ${extension}`);
      assert.ok(
        gltf.materials?.some((material) => extension in (material.extensions ?? {})),
        `${asset} must exercise ${extension} on a material`
      );
    }
  });
}
