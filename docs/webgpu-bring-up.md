# Experimental WebGPU sphere pipeline

Run Vite and open `webgpu-demo.html` under its `/pathtracer-lab/` base path.
This development-only entry is deliberately not included in the production build
or connected to the editor. WebGL remains the default and production backend.

The fixture contains three diffuse spheres, a gradient sky, an orbitable perspective
camera, eight bounces, and cosine-weighted diffuse sampling. Each dispatch adds
one jittered sample per pixel. It is not the parity manifest's sphere scene;
materials, camera, random sequences and sky have not been matched to WebGL.
Do not draw performance or correctness-parity conclusions from this demo.

## Mapping from WebGL

| WebGL concept | This WebGPU implementation |
| --- | --- |
| Fragment-shader path-tracing draw | WGSL compute pipeline with 8×8 workgroups |
| Uniform values | An 80-byte uniform buffer for dimensions, sample count, seed and camera basis |
| Texture/uniform bindings | Explicit bind groups derived from pipeline layouts |
| Ping-pong accumulation targets | One RGBA float32 storage buffer holding running means |
| Draw calls | Compute and render passes encoded into one submitted command buffer |
| Full-screen presentation quad | A full-screen triangle reading accumulation in a fragment shader |

One compute invocation exclusively owns each pixel's storage element. It can
read the previous mean and write the new mean in place without cross-pixel
dependencies. The subsequent presentation pass reads the same buffer; pass ordering
provides the dependency. Linear radiance is retained in storage and converted to
sRGB only for canvas presentation. No tone mapping or denoising is applied.

The demo waits for queue completion before scheduling another frame, keeping
work bounded. This simple lifecycle is intentional, not a throughput benchmark.

## Ownership and reset

`createSphereDemo` owns its device, uniform buffer, accumulation buffer and canvas
configuration. Resize validates device limits, destroys the old accumulation
buffer, recreates bind groups and resets samples. Sample zero overwrites old data,
so reset does not need a separate clear pass. A generation counter prevents a
pre-reset asynchronous completion from incrementing the new sample count.

Disposal is idempotent, unconfigures the canvas and destroys owned resources.
Device loss and uncaptured validation errors stop rendering with a visible error;
reload is required to retry. Automatic device recovery is not implemented.

Camera input uses Three.js OrbitControls (orbit, pan, zoom and touch gestures),
but ray generation and rendering run in WGSL. Changes upload a world-up camera
basis and reset accumulation. Identical camera values leave accumulation intact.
Polar limits avoid the world-up singularity; the packing helper rejects invalid
camera values rather than submitting NaNs to the GPU.

## Initial validation

On September 8, 2026, isolated Chrome 152 successfully compiled both pipelines
and rendered the fixture with increasing sample counts. Browser checks exercised
reset during an in-flight frame, first-sample restart, resize to 65×49 (partial
workgroups), and explicit device destruction with a loss notification. Typecheck
also passed. These checks do not establish radiance convergence or cross-backend
parity.

Run `node scripts/webgpu-browser-smoke.mjs` with the isolated Chrome endpoint on
19687 and Vite on 3019. Override with `PARITY_CDP_URL` and `WEBGPU_APP_URL`.
The runner opens/closes only its own tab and does not start the editor. Actual
linear float32 GPU readback verifies finite/nonblack output, every pixel written
at 65×49, changing accumulation, exact reset repeatability, in-flight reset,
camera change/restore, resized output length, and device-loss notification. It
fails if WebGPU is unavailable rather than silently reporting a successful skip.
Camera-basis unit tests run as part of `pnpm test`.

Add `--convergence` to run an exploratory 64×48 convergence regression. Candidate
seeds 12345 and 67890 are checked at 16, 64 and 256 samples against seed 987654321
at 2048 samples. Reference drift is also measured between 1024 and 2048 samples.
The test requires aggregate error at 256 samples to be lower than at 16; it does
not demand monotonic error for every individual random run. Seed changes reset
accumulation and reject non-uint32 input. Distinct seeds do not by themselves
certify statistically independent streams.

The September 8 Chrome run measured mean linear RGB NRMSE of 0.03598, 0.01808,
and 0.00940 respectively. Reference mean-luminance drift was approximately
0.0041%. These are small-fixture diagnostic observations, not public benchmark
results or evidence that the integrator is unbiased. The command prints all
per-seed metrics and reference settings as JSON; retain output with the source
revision when using it for a regression comparison.

Readback is diagnostic-only, requires an idle completed frame, uses a temporary
mapped staging buffer, and rejects capture invalidation. It is not included in
the animation loop.

## Gap to the WebGL parity fixture

The manifest's `RTIOW1Simple` uses three spheres at x = 0, −1.2 and +1.2,
z = 0, radius 0.5, plus a finite ground quad at y = −0.5. Materials are diffuse,
dielectric (IOR 1.5), and fuzzy metal (fuzz 0.1), with a yellow diffuse ground.
Its fixed camera is [0, 0.5, 2] looking at [0, 0.5, 0], FOV 45°.

The bring-up fixture intentionally has different positions, colors, a spherical
ground, and diffuse-only transport. Matching the camera alone is not parity.
Production scene-buffer ingestion, quad intersections, dielectric/metal semantics,
environment evaluation and termination rules need matching before cross-backend
transport comparisons. Preserve the existing versioned WebGL workload rather than
silently reducing it to this demo's feature set. Those ports follow the minimal
pipeline bring-up; the full-resolution/device-matrix reference campaign is still
pending.

API reference: [WebGPU specification](https://www.w3.org/TR/webgpu/).

## Production analytic-geometry diagnostic

`node scripts/webgpu-browser-smoke.mjs --geometry` compiles the actual
`RTIOW1Simple` through `SceneCompiler`, packs its three spheres and ground quad
into WebGPU storage, and runs a separate WGSL intersection compute pass. This
does not replace the diffuse demo or claim material parity. Boxes
are rejected explicitly rather than omitted. The diagnostic compares a linear
scan and production sphere-BVH traversal; quads remain linearly scanned.

Results contain geometric outward normals, distance and integer primitive/material
IDs (sphere IDs first, then quads). The CPU oracle checks 3072 center-of-pixel
camera rays plus six interior/backface/miss cases. On September 8 all 3078 rays
matched hit/miss and material/primitive identity: 1315 hits, 1763 misses, maximum
absolute distance error about 0.0000131, within the protocol's scaled distance
tolerance; normal dot products passed 0.9999. No silhouette exclusions were needed
for this finite ray set. This is CPU-oracle agreement, not comparison against
WebGL GPU hit readback or proof for all possible rays.

The sphere BVH retains production depth-first child addressing and leaf reference
indices, uploaded as storage buffers. A bounded 64-entry stack traverses left
before right; the host validates references/tree depth and the shader reports
overflow explicitly. Slab tests handle zero direction components without dividing
by zero. Exact-distance ties follow traversal order and are not a general guarantee
of lowest primitive ID.

Both traversal paths match exactly for the baseline test rays. A separate
100-sphere fixture exercises 63 nodes at depth 5; all 3078 rays also matched the
linear GPU scan. The BVH performed 13,840 sphere tests versus 307,800 for that
linear scan. This is a diagnostic work count, not a measured GPU speedup.

The same command also compiles the packed-triangle scene and checks its explicit
triangle-only subset: 2048 triangles and 1023 BVH nodes. The diagnostic packs
triangle vertices/material IDs, runs two-sided Möller–Trumbore intersections,
and reports geometric normals. It reuses the shared depth-first BVH layout and
bounded stack, with a primitive offset for triangle IDs. A capture traverses one
BVH type at a time and linearly scans the other primitive ranges; combined
sphere/triangle acceleration is not integrated yet.

On September 8, all 768 fixed camera rays matched the linear GPU scan exactly
and passed CPU identity, normal and distance checks: 380 hits, 388 misses, maximum
distance error about 0.00000175. BVH traversal tested 2352 triangles versus 1572864
for the linear scan. Again this is a work count, not timing. Analytic boxes and
production transport integration remain pending.

## Triangle surface attributes

An additional storage buffer preserves production vertex normals and UVs. The
diagnostic can return barycentric B/C weights, interpolated UVs, oriented shading
normals and a front-face sign without changing the original hit-record format.
UVs are not clamped: wrapping belongs to texture sampling. Interpolated normals
are normalized, aligned to the geometric hemisphere and oriented for the hit
side; a zero-length interpolation falls back to the geometric normal.

The `--geometry` browser run includes a known-answer triangle with different
vertex normals and out-of-range UVs. Front/back hits, barycentrics, UV interpolation,
reversed vertex normals, zero-normal fallback and cleared miss records all passed
on September 8. These checks cover attribute interpolation only, not texture
filtering, normal mapping, shading-normal transport corrections or material parity.
Sphere/quad UV generation is not implemented in this diagnostic. Surface data
is not yet connected to the sphere path-tracing transport loop.

## Interactive geometry preview

Open `webgpu-demo.html?geometry=1` for a GPU-only preview of the packed scene's
triangle subset. A compute pass generates camera rays, the validated intersection
pass traverses the triangle BVH, and a full-screen render pass reads the hit and
surface buffers. No per-frame CPU readback is used. Modes show shading normals,
an interpolated-UV checker, or barycentric coordinates; orbit/pan/zoom and resize
are supported. The counter is frames, not accumulated samples: this is a primary-hit
diagnostic, not material rendering or path tracing. Analytic objects are explicitly
excluded from this view. The original sphere transport demo remains at the plain URL.

Chrome visual checks covered all three modes, orbit and 800×600 resize. The
`--geometry` smoke also constructs this pipeline at 65×49, renders each mode,
updates its camera and checks that frames complete without reported GPU errors.
