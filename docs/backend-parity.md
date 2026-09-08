# WebGL / WebGPU parity and benchmark protocol

This protocol defines the comparison before the second backend is implemented.
It is not a performance result. WebGPU is not yet available. WebGL diagnostic
timing, scene hashes, and reference-file export are implemented; independent-stream
validation and converged reference runs remain pending. Do not substitute the UI
FPS counter for these measurements.

### Current diagnostic tools

`ParityCapture.captureWebGlParity()` runs a preset in an isolated canvas, warms
up for five seconds, resets accumulation to an explicit sample-sequence offset,
and reads the completed RGBA32F target. It requires full-frame tracing and rejects
precision fallback, hidden-tab interruption, timeout, wrong dimensions/sample
range, or non-finite radiance. Rows are bottom-up; all metrics must use the same
orientation. Its elapsed duration includes setup/readback and is **not** throughput.
Sequence offsets select repeatable subsequences, not statistically proven
independent RNG streams. Independent-reference certification remains future work.

Start Vite on port 3017 and an isolated Chrome with remote debugging on port
19687, then run `node scripts/parity-browser-smoke.mjs`. Override addresses using
`PARITY_APP_URL` and `PARITY_CDP_URL`. The script creates/closes only its own page;
it imports the development harness without starting the editor. The 64×48,
16-sample smoke test checks nonzero finite output, exact same-sequence repeatability
and changed output at a different offset. It is not the 800×600 reference suite.
Run against a clean committed preset baseline for publishable reference captures.

For an exploratory full-resolution export, use:

```sh
PARITY_APP_URL=http://127.0.0.1:3018/pathtracer-lab/ \
PARITY_SCENE=RTIOW1Simple PARITY_SAMPLES=64 \
node scripts/parity-browser-smoke.mjs --export /tmp/parity-spheres-run-1
```

The output directory must not exist. The exporter verifies the served preset
source against the manifest's Git revision, then writes `linear.rgba32f` and
`capture.json`. Metadata records dimensions, sample range, byte/row order, raw
SHA-256, logical scene SHA-256, scene counts, camera/settings, browser user agent,
and loaded HDR/glTF asset hashes. Logical hashes cover geometry/material/texture
descriptors and lights; asset hashes cover source file bytes, not GPU resources.
Keep the harness revision/diff with the results: verifying presets alone does
not establish that the entire renderer matches a committed release.

These exports are still exploratory, not independently converged references or
GPU benchmarks. Never use setup-inclusive elapsed time as sample throughput.

`ParityMetrics.compareLinearFrames()` computes unclipped linear RGB NRMSE and
signed luminance bias, ignoring alpha. Unit tests cover HDR exposure differences,
black references, invalid buffers and identical RGB with different alpha.

Set `PARITY_SEQUENCE_OFFSET` when exporting to choose a non-overlapping sample
range. For example, compare candidates starting at 0 against a reference starting
at 10000, with each range shorter than 10000 samples. Non-overlap avoids directly
reusing samples, but does not establish statistical independence of the shader hash.

Compare saved captures without rerendering:

```sh
node --experimental-strip-types scripts/parity-compare.mjs REFERENCE_DIR CANDIDATE_DIR...
```

The comparator validates raw checksums, byte order, dimensions, camera/settings,
scene/asset identity, source snapshots when available, and sample sequence metadata.
It reports unclipped linear RGB NRMSE and signed luminance bias. Overlapping ranges,
missing legacy source provenance, or a reference with no more samples than the
candidate are explicit warnings. Every report remains exploratory: a single
finite-sample reference cannot certify convergence or integrator correctness.

For multiple equal-budget references, use:

```sh
node --experimental-strip-types scripts/parity-ensemble.mjs \
  --references REF1 REF2 REF3 REF4 --candidates CAPTURE64 CAPTURE256
```

This validates compatibility and rejects overlapping reference/reference or
reference/candidate sequence ranges. It averages linear radiance using float64
storage, reports candidate error against that mean, and reports sample standard
deviation of reference mean luminance. NRMSE variation against individual references
describes reference variability, not variation across independent candidate runs.
Outputs remain exploratory regardless of sample count: non-overlap alone does not
prove RNG independence, and reference-budget doubling remains a separate check.

## Fixed workloads

[backend-parity.json](backend-parity.json) is the versioned workload manifest.
Generate the run checklist with `node scripts/backend-parity-plan.mjs`.
Run both backends from one source revision and the same compiled scene. Version 1
uses the committed presets at `e261be7`; local unpublished scene edits are excluded.
If geometry, assets, shading semantics or defaults change, update the manifest
version and recapture both baselines. Do not compare against an older screenshot.

Use the manifest's explicit perspective camera, world-up +Y, aspect 4:3, near
0.1 and far 10000. Camera jitter is enabled, aperture is zero, and the camera is
stationary. Freeze authored material/light/texture values from the preset;
record the compiled scene counts, a hash of its logical data, and asset SHA-256s.
Backend-specific buffer packing may differ without changing scene semantics.
Cornell uses a black sky/horizon; HDR scenes retain their authored map and
intensity with background visible. No user preferences or saved editor changes.

Full-frame tracing only: no raster comparison, ROI, selection masks, debug
overlays, denoising, offline jobs in parallel, or adaptive resolution. The render
target is exactly 800×600 pixels regardless of display DPR. Accumulate linear
radiance in 32-bit floats; record and match presentation exposure, tone mapping
and output color space separately. Unsupported features are reported as skipped,
not silently replaced or counted as successful parity.

## Procedure

1. Record revision, manifest version, backend, OS, browser/version, GPU/driver
   information available to the browser, device limits/features, power mode,
   display refresh rate, target size, and asset/data hashes. Redact unnecessary
   hardware identifiers before publishing. Use a clean browser profile.
2. Load one preset, apply the manifest, await all model/HDR loads and scene
   compilation, then verify camera and scene hashes. Fail the run on load errors.
3. Record cold asset loading separately from warm-cache initialization. Measure
   CPU scene compilation/BVH build, CPU upload submission, shader/pipeline setup,
   and GPU upload completion separately where supported. Do not add overlapping
   async durations together or call CPU submission time GPU execution time.
4. Warm up for at least 5 seconds and await pending shader/pipeline preparation.
   Reset accumulation and counters, then measure a stationary 10-second window.
   Repeat five times, alternating backend order. Invalidate runs interrupted by
   tab hiding, resize, camera/settings changes, GPU disjoint events/device loss,
   or thermal/power-state changes. Record exclusions and rerun them.
5. Report median and p95 GPU time per sample batch, CPU submission time, and
   end-to-end frame time separately. Use WebGL timer queries / WebGPU timestamps
   only when supported; mark GPU timing unavailable otherwise. Read timing
   results asynchronously outside the measured submission path.
6. Report pixel-samples/second as `width × height × completed samples / seconds`.
   This is not rays/second: bounce and shadow-ray work varies. Vsync-limited
   interactive throughput must be labeled as such. Never claim uncapped backend
   throughput from animation-frame FPS.
7. Run correctness and convergence captures separately from timing, at the sample
   checkpoints in the manifest. Readback and image encoding are excluded from
   throughput windows. Keep raw linear buffers and display PNGs with metadata.
8. Record allocated GPU resource bytes calculated from resource descriptors,
   separately from CPU arrays and any browser memory observations. These are not
   total VRAM usage; driver allocations may be invisible. Include resource
   disposal/device-loss behavior in lifecycle verification.

## Correctness and convergence

First compare non-stochastic diagnostics: primary rays, hit/miss masks, hit
distance, normals and material/object identities on fixed center-of-pixel rays.
For non-edge pixels require identical hit/material IDs, distance error at most
`1e-4 × max(1, abs(reference distance))`, and normal dot product at least `0.9999`.
Inspect silhouettes and equal-distance ties separately; do not hide broad errors
behind an edge mask. Reject NaN/Inf output at any sample count.

For transport, use four independent 4096-sample WebGL reference runs per scene;
double the reference budget if mean luminance changes by more than 1% when the
budget doubles. Retain each reference, not just the average. These are regression
references, not proof that the WebGL integrator is physically correct.

Measure linear RGB NRMSE: `sqrt(mean((test-reference)^2)) /
max(1e-6, sqrt(mean(reference^2)))`. For each checkpoint, render four independent
runs per backend and report mean/stddev NRMSE and signed mean-luminance error
against the reference mean. Do not require bit-identical RNG sequences. Record
seed/run identity; until resettable independent sequences are instrumented,
captures are exploratory rather than protocol-certified.

Provisional parity gates at 1024 samples: WebGPU mean NRMSE must be no more than
`1.25 × WebGL mean NRMSE + 0.005`, and absolute mean-luminance bias must be no more
than `max(0.02, 3 × reference-run relative luminance stddev)`. Treat these as
initial regression thresholds, not universal accuracy guarantees; freeze them
before comparing implementations. Failures require investigation, not automatic
tolerance widening. Include fixed crops of shadows, dielectric edges, highlights
and texture detail; global averages can conceal localized bugs.

Plot error against both samples and wall time. Keep three distinct conclusions:
intersection/shading correctness, estimator convergence, and sample throughput.
A faster biased image is not a win. Match integrator and termination rules,
including light-selection PDFs, MIS weighting and any clamping/roulette settings.

## Device matrix and reporting

Initial targets: Apple Silicon M1 and M4 Macs on Chrome and Safari, plus an
available iPhone/Safari and Android/Chrome. Add Windows/Chrome with a discrete GPU
when available. Record exact OS/browser versions and supported features at run
time. This is a target matrix, not a claim those devices have been tested or
support both backends. Preserve WebGL results when WebGPU is unsupported.

Store one record per repetition with scene, backend, device, settings, hashes,
warm-up, valid sample count, elapsed time, CPU/GPU timing distributions, allocated
bytes, warnings and capture paths. Publish raw records alongside summaries;
never pool different devices into a single speedup. Add 400×300 and 1600×1200,
depth 4/12 and samples-per-frame 4 only as separately labeled scaling sweeps
after the base workload passes. Triangle-count sweeps need versioned fixtures.

## Implementation sequence

Exports include `sources.json`: actual served first-party source text (including
`.fs`/`.vs` shader entry points and shader libraries), package
manifest, lockfile, Vite configuration, and local runner sources. Sorted path/content
digests are checked before and after capture; a served-source change rejects the
run. This preserves local harness changes without pretending they were part of the
baseline commit. Binary HDR/glTF assets retain separate hashes. Installed dependencies
are not independently verified against the lockfile.

Device records include WebGL/GLSL version, context attributes, timer/float-buffer
support, and vendor/renderer strings (unmasked only when exposed). Browser privacy
restrictions can make these incomplete. Exact OS version, power mode, thermal state,
and competing GPU workloads must be recorded manually before publishing claims.

For exploratory repeated WebGL measurements, run the export script with
`--measure --export <new-directory>` against the isolated baseline Vite server.
It defaults to the manifest's five 10-second windows with five seconds of warm-up
before each repetition. `PARITY_WINDOW_SECONDS` and `PARITY_REPETITIONS` permit
shorter harness checks; their actual values are retained in the output and must
not be presented as the full protocol. The final image capture/readback and asset
hashing happen after all timing windows.

Each repetition retains submitted sample batches, actual submission-window length,
all GPU batch durations, and nearest-rank median/p95. Completed pixel-samples per
second uses elapsed time **through final query completion**, including asynchronous
drain/polling latency; it is conservative frame-paced throughput, not maximum GPU
capacity or rays per second. Without GPU timing support, completion and throughput
remain null. Disjoint/context/query failures mark the repetition invalid. CPU
submission durations measure wall time in `renderer.render`, including driver
stalls but excluding timer query setup/polling, target preparation, and compositing.
They are separate from GPU duration, even without GPU timer support. Visibility changes,
resizing, and context loss abort the capture rather than allowing a partial export.

The development capture harness accepts `gpuTiming: true` to collect optional
`EXT_disjoint_timer_query_webgl2` measurements around the path-tracing draw only.
It excludes setup, target preparation, compositing, and float readback. Queries
are polled asynchronously outside the draw; missing support, disjoint results,
context loss, allocation failures, and query conflicts produce an explicit
unavailable reason rather than a CPU-time substitute. Pending queries are bounded
and cleaned up on disposal. The browser smoke test checks a timed capture against
an untimed capture. These short, frame-paced diagnostics are not the repeated
10-second throughput measurements specified above.

- This ticket establishes the workload and reporting contract, not benchmark results.
- Minimal WebGPU camera/sphere/accumulation bring-up follows independently.
- Add timing, linear readback, seed controls and scene-snapshot adapters to both
  backends before calling an automated result protocol-compliant.
- Port BVH/material features incrementally; retain explicit skip reasons until
  each workload has feature parity. Benchmark speed only after correctness gates.
