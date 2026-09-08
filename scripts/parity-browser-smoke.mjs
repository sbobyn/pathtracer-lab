import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { decodeRawModule, snapshotServedSources, sourceSnapshotDigest, isParitySourcePath } from './parity-source-snapshot.mjs';
// Requires an isolated Chrome debugging endpoint and an already running Vite server.
const exportIndex = process.argv.indexOf('--export');
const exportDirectory = exportIndex >= 0 ? process.argv[exportIndex + 1] : null;
if (exportIndex >= 0 && !exportDirectory) throw new Error('--export requires a new output directory');
const manifest = JSON.parse(readFileSync(new URL('../docs/backend-parity.json', import.meta.url), 'utf8'));
const measure = process.argv.includes('--measure');
if (measure && !exportDirectory) throw new Error('--measure requires --export to preserve raw results');
const measurement = measure ? {
  windowSeconds: Number(process.env.PARITY_WINDOW_SECONDS ?? manifest.measurement.windowSeconds),
  repetitions: Number(process.env.PARITY_REPETITIONS ?? manifest.measurement.repetitions),
} : undefined;
if (measurement && (!Number.isFinite(measurement.windowSeconds) || measurement.windowSeconds <= 0 || measurement.windowSeconds > 60 || !Number.isSafeInteger(measurement.repetitions) || measurement.repetitions < 1 || measurement.repetitions > 20)) throw new Error('Invalid measurement window/repetitions');
const captureTimeoutMs = 150000 + (measurement ? (measurement.windowSeconds + 5) * measurement.repetitions * 1000 : 0);
const sceneKey = process.env.PARITY_SCENE ?? 'RTIOW1Simple';
const fixture = manifest.scenes.find(scene => scene.key === sceneKey);
if (!fixture) throw new Error('Scene is not in parity manifest');
const samples = Number(process.env.PARITY_SAMPLES ?? 16);
if (!Number.isSafeInteger(samples) || samples < 1) throw new Error('Invalid PARITY_SAMPLES');
const sequenceOffset = Number(process.env.PARITY_SEQUENCE_OFFSET ?? 0);
if (!Number.isSafeInteger(sequenceOffset) || sequenceOffset < 0 || !Number.isSafeInteger(sequenceOffset + samples)) throw new Error('Invalid PARITY_SEQUENCE_OFFSET');
const endpoint = process.env.PARITY_CDP_URL ?? 'http://127.0.0.1:19687';
const base = process.env.PARITY_APP_URL ?? 'http://127.0.0.1:3017/pathtracer-lab/';
let sourceSha256;
let sourceSnapshot;
let sourcePaths;
const runnerPaths = ['scripts/parity-browser-smoke.mjs','scripts/parity-source-snapshot.mjs','docs/backend-parity.json'];
const readRunnerFiles = () => Object.fromEntries(runnerPaths.map(path => [path,readFileSync(new URL(`../${path}`,import.meta.url),'utf8')]));
const runnerFiles = readRunnerFiles();
const runnerSha256 = sourceSnapshotDigest(runnerFiles);
if (exportDirectory) {
  const expected = execFileSync('git', ['show', `${manifest.baselineRevision}:src/pathtracer/PresetPtScenes.ts`], {cwd:new URL('..',import.meta.url)});
  const response = await fetch(new URL('src/pathtracer/PresetPtScenes.ts?raw', base));
  const moduleText = await response.text();
  // Vite's raw module is a JS string export, not the source file response itself.
  // Accept only a quoted literal (never arbitrary served JavaScript or templates).
  if (!response.ok) throw new Error('Cannot verify served preset source');
  const actual = Buffer.from(decodeRawModule(moduleText));
  if (!actual.equals(expected)) throw new Error('Served presets differ from committed baseline; use an isolated baseline checkout.');
  sourceSha256 = createHash('sha256').update(actual).digest('hex');
  sourcePaths = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', 'src'], {cwd:new URL('..',import.meta.url),encoding:'utf8'})
    .trim().split('\n').filter(isParitySourcePath);
  sourcePaths.push('package.json', 'pnpm-lock.yaml', 'vite.config.js');
  sourceSnapshot = await snapshotServedSources(base, sourcePaths);
  if (sourceSnapshot.files['src/pathtracer/PresetPtScenes.ts'] !== actual.toString()) throw new Error('Preset changed during source snapshot.');
  mkdirSync(resolve(exportDirectory), {recursive:false}); // Never overwrite an earlier reference run.
}
const response = await fetch(`${endpoint}/json/new?about:blank`, { method: 'PUT' });
if (!response.ok) throw new Error(`Cannot create diagnostic page: ${response.status}`);
const page = await response.json();
const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
let sequence = 0;
const pending = new Map();
socket.onmessage = event => {
  const message = JSON.parse(event.data);
  pending.get(message.id)?.(message);
};
function call(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Timed out: ${method}`)); }, method==='Page.close'?5000:captureTimeoutMs + 30000);
    pending.set(id, message => {
      clearTimeout(timer); pending.delete(id);
      if (message.error) reject(new Error(JSON.stringify(message.error)));
      else resolve(message.result);
    });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
try {
  await call('Page.enable');
  await call('Emulation.setFocusEmulationEnabled', { enabled: true });
  // Markdown document gives us the app origin without starting the interactive renderer.
  await call('Page.navigate', { url: new URL('README.md', base).href });
  await new Promise(resolve => setTimeout(resolve, 1500));
  const captureUrl = new URL('src/pathtracer/ParityCapture.ts', base).href;
  const metricsUrl = new URL('src/pathtracer/ParityMetrics.ts', base).href;
  const expression = exportDirectory ? `(async () => {
    window.__parityExportStage = 'importing harness';
    document.body.innerHTML = '';
    const {captureWebGlParity} = await import(${JSON.stringify(captureUrl)});
    const options = ${JSON.stringify({sceneKey,camera:fixture.camera,width:manifest.settings.width,height:manifest.settings.height,samples,sequenceOffset,maxRayDepth:manifest.settings.maxRayDepth,timeoutMs:captureTimeoutMs,measurement})};
    window.__parityExportStage = 'capturing';
    const capture = await captureWebGlParity(options);
    window.__parityExportStage = 'encoding';
    const {data,...metadata} = capture;
    window.__parityRaw = new Uint8Array(data.buffer);
    const assets=[];
    const urls=[...new Set(performance.getEntriesByType('resource').filter(r=>r.initiatorType==='fetch').map(r=>r.name).filter(url=>/\\.(hdr|glb)(?:$|\\?)/i.test(url)&&!url.includes('import')))];
    for(const url of urls){const response=await fetch(url,{signal:AbortSignal.timeout(30000)});if(!response.ok)throw Error('Asset hash fetch failed');const bytes=await response.arrayBuffer();const digest=await crypto.subtle.digest('SHA-256',bytes);assets.push({url,bytes:bytes.byteLength,sha256:Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('')})}
    return {metadata:{...metadata,assets},byteLength:data.byteLength,byteOrder:new Uint8Array(new Uint32Array([1]).buffer)[0]===1?'little-endian':'big-endian'};
  })()` : `(async () => {
    document.body.innerHTML = '';
    const {captureWebGlParity} = await import(${JSON.stringify(captureUrl)});
    const {compareLinearFrames} = await import(${JSON.stringify(metricsUrl)});
    const options = {sceneKey:'RTIOW1Simple', camera:{position:[0,.5,2],target:[0,.5,0],fovDegrees:45}, width:64,height:48,samples:16,sequenceOffset:0};
    const a = await captureWebGlParity({...options, gpuTiming:true});
    const b = await captureWebGlParity(options);
    const c = await captureWebGlParity({...options, sequenceOffset:10000});
    const same = compareLinearFrames(a.data,b.data), different = compareLinearFrames(a.data,c.data);
    if (same.nrmse !== 0 || different.nrmse === 0 || same.meanReferenceLuminance <= 0) throw new Error('Repeatability failed: '+JSON.stringify({same,different}));
    if (a.gpuTiming?.status === 'available' && a.gpuTiming.gpuBatchMs.length !== a.batches) throw new Error('Incomplete GPU timing samples');
    return {kind:'64x48 diagnostic, not benchmark',batches:a.batches,rowOrder:a.rowOrder,gpuTiming:a.gpuTiming,same,different};
  })()`;
  const result = await call('Runtime.evaluate', { awaitPromise: true, returnByValue: true, expression });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  const value = result.result.value;
  if (exportDirectory) {
    const afterSnapshot = await snapshotServedSources(base, sourcePaths);
    if (afterSnapshot.sha256 !== sourceSnapshot.sha256) throw new Error('Served source changed during capture; discard this run.');
    if (sourceSnapshotDigest(readRunnerFiles()) !== runnerSha256) throw new Error('Runner changed during capture; discard this run.');
    const chunks=[];
    for(let offset=0;offset<value.byteLength;offset+=65536){
      const chunk=await call('Runtime.evaluate',{returnByValue:true,expression:`(()=>{const bytes=window.__parityRaw.subarray(${offset},${offset+65536});let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(binary)})()`});
      if(chunk.exceptionDetails)throw new Error('Float transfer failed');
      chunks.push(Buffer.from(chunk.result.value,'base64'));
    }
    const raw = Buffer.concat(chunks);
    if (raw.length !== manifest.settings.width*manifest.settings.height*16) throw new Error('Invalid float export length');
    const metadata = {...value.metadata,byteOrder:value.byteOrder,format:'float32-rgba',
      manifestVersion:manifest.version,baselineRevision:manifest.baselineRevision,presetSourceSha256:sourceSha256,
      servedSourceSha256:sourceSnapshot.sha256, servedSourceArchive:'sources.json',
      runnerSha256,
      sourceCoverage:'first-party src code plus package.json, lockfile and Vite config; dependency installation not independently verified',
      rawSha256:createHash('sha256').update(raw).digest('hex'),
      certification:'exploratory; full convergence, device provenance, and backend parity certification pending'};
    writeFileSync(resolve(exportDirectory,'linear.rgba32f'),raw,{flag:'wx'});
    writeFileSync(resolve(exportDirectory,'capture.json'),JSON.stringify(metadata,null,2),{flag:'wx'});
    writeFileSync(resolve(exportDirectory,'sources.json'),JSON.stringify({served:sourceSnapshot,runner:{sha256:runnerSha256,files:runnerFiles,node:process.version}},null,2),{flag:'wx'});
    console.log(JSON.stringify(metadata,null,2));
  } else console.log(JSON.stringify(value, null, 2));
} finally {
  try { await call('Page.close'); } finally { socket.close(); }
}
