import { createHash } from 'node:crypto';
import { runInNewContext } from 'node:vm';

export function isParitySourcePath(path) {
  return /\.(?:ts|tsx|js|jsx|glsl|wgsl|vert|frag|fs|vs|css|json)$/.test(path);
}

export function decodeRawModule(moduleText) {
  // Only evaluate the quoted literal, never the rest of a served module.
  const literal = moduleText.match(/^export default ("(?:[^"\\\r\n]|\\[^\r\n])*"|'(?:[^'\\\r\n]|\\[^\r\n])*'|`(?:[^`\\$]|\\[\s\S]|\$(?!\{))*`)\s*;?/);
  if (!literal) throw new Error('Expected a Vite raw string export');
  return runInNewContext(literal[1], Object.create(null), { timeout: 100 });
}

export function sourceSnapshotDigest(files) {
  const entries = Object.keys(files).sort().map(path => [path, files[path]]);
  return createHash('sha256').update(JSON.stringify(entries)).digest('hex');
}

export function decodeServedSource(text, contentType = '') {
  if (contentType.includes('text/html') || /^\s*<!doctype html/i.test(text)) throw new Error('Unexpected HTML fallback');
  // Vite can return static source verbatim or a transformed raw-string module.
  return /^export default ["'`]/.test(text) ? decodeRawModule(text) : text;
}

/** Snapshot actual served text, not an assumed local worktree revision. */
export async function snapshotServedSources(base, paths) {
  const queue = [...new Set(paths)].sort();
  const files = {};
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (queue.length) {
      const path = queue.shift();
      if (!path || path.startsWith('/') || path.split('/').includes('..')) throw new Error('Invalid source path');
      const response = await fetch(new URL(`${path}?raw`, base), { signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error(`Cannot snapshot served source: ${path}`);
      const text = await response.text();
      try {
        files[path] = decodeServedSource(text, response.headers.get('content-type') ?? '');
        if (path === 'package.json') JSON.parse(files[path]);
      }
      catch (error) { throw new Error(`Cannot decode served source: ${path}`, { cause: error }); }
    }
  }));
  return { sha256: sourceSnapshotDigest(files), files };
}
