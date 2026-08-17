# Three.js WebGL Pathtracer

An educational, real-time WebGL path tracer integrated with Three.js. It is an original implementation that currently follows the concepts in Peter Shirley's [Ray Tracing in One Weekend](https://raytracing.github.io/) while adapting them to an iterative GLSL renderer.

Live demo: https://sbobyn.github.io/three-pathtracer/

![Path tracer demo](three-pathtracer.gif)

## Current capabilities

The path tracer is implemented in `src/shaders/main.fs` and currently supports:

- ray-sphere intersection
- diffuse, metal, and dielectric materials
- depth of field / defocus blur
- progressive accumulation with ping-pong render targets
- accumulation reset when the camera moves

The Three.js application provides:

- a `THREE.Scene` scene graph for scene and camera management
- a switchable raster preview
- orbit camera controls
- raycaster-based object selection
- transform controls for selected objects
- selection outlines via `OutlinePass`
- a `lil-gui` debug UI for renderer settings and object editing

The hash-based random-number generator was adapted from [this ShaderToy](https://www.shadertoy.com/view/4djSRW).

## Running locally

Prerequisites: Node.js 20.17 or newer and pnpm.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

The development server defaults to `http://localhost:3005/three-pathtracer/`.

Quality checks:

```sh
pnpm typecheck
pnpm build
pnpm verify
```

`pnpm verify` runs both the TypeScript check and production build.

## Verified baseline

The baseline has been manually verified in a Chromium browser on macOS with Three.js r177 and WebGL:

- `Part1Simple` renders in raster and path-traced modes.
- `Part1Final` renders in raster and path-traced modes.
- orbit controls, object selection, transform mode, sphere radius editing, resolution scale, and depth-of-field controls respond without browser warnings or errors.
- TypeScript checking and the production Vite build pass.

Reference captures and their constraints are documented in [`docs/reference/README.md`](docs/reference/README.md).

Known baseline limitations:

- `Part1Final` uses `Math.random()`, so its scene and reference image vary between reloads.
- Visual verification is manual; there is no automated image-regression suite yet.
- The production bundle currently triggers Vite's non-blocking warning for a chunk larger than 500 kB.
- Accumulation precision, post-processing accumulation, and event-listener/resize lifecycle behavior still need further investigation.
- A WebGL-capable browser is required. There is no WebGPU backend yet.

## Roadmap

Broad future directions include:

- textures, quads, and area lights inspired by *Ray Tracing: The Next Week*
- original triangle intersection and mesh data paths
- BVH construction, traversal, and visualization
- glTF mesh rendering built on the triangle, BVH, material, and texture systems
- clearer state ownership and a UI decoupled from path-tracer behavior
- a WebGPU backend and reproducible WebGL/WebGPU benchmarks
- rasterized approximations for side-by-side quality and performance comparisons

External projects may inform architecture research, but code and renderer design remain original unless attribution explicitly says otherwise.
