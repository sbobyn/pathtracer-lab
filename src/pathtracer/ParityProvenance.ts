/** Canonical logical data, independent of object key insertion order and GPU packing. */
export function canonicalParityJson(value: unknown): string {
  if (typeof value === 'number') {
    if (Number.isNaN(value)) throw new Error('NaN in parity scene data.');
    if (!Number.isFinite(value)) return JSON.stringify(value > 0 ? '+Infinity' : '-Infinity');
  }
  if (value === null || typeof value !== 'object') {
    const encoded = JSON.stringify(value);
    if (encoded === undefined) throw new Error('Unsupported parity data.');
    return encoded;
  }
  if (Array.isArray(value)) return `[${value.map(canonicalParityJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${canonicalParityJson(record[key])}`).join(',')}}`;
}

export async function paritySha256(data: Uint8Array<ArrayBuffer>) {
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}
