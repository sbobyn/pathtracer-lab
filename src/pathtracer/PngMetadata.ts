/** Adds a standards-compliant PNG tEXt chunk without decoding or recompressing pixels. */
export async function embedPngText(blob: Blob, keyword: string, value: string) {
  if (blob.type !== "image/png") throw new TypeError("PNG metadata requires an image/png blob");
  const safeKeyword = keyword.replace(/[^\x20-\x7e]/g, "").slice(0, 79);
  if (!safeKeyword) throw new TypeError("PNG text keyword is empty");
  const source = new Uint8Array(await blob.arrayBuffer());
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (!signature.every((byte, index) => source[index] === byte)) throw new TypeError("Invalid PNG signature");
  const text = new TextEncoder().encode(`${safeKeyword}\0${value}`);
  const type = new TextEncoder().encode("tEXt");
  const chunk = new Uint8Array(12 + text.length);
  new DataView(chunk.buffer).setUint32(0, text.length);
  chunk.set(type, 4);
  chunk.set(text, 8);
  new DataView(chunk.buffer).setUint32(8 + text.length, crc32(chunk.subarray(4, 8 + text.length)));
  const iend = source.length - 12;
  return new Blob([source.subarray(0, iend), chunk, source.subarray(iend)], { type: "image/png" });
}

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}
