# Three.js WebGL Pathtracer

An educational, real-time WebGL path tracer integrated with Three.js. It is an original implementation that currently follows the concepts in Peter Shirley's [Ray Tracing in One Weekend](https://raytracing.github.io/) while adapting them to an iterative GLSL renderer.

Live demo: https://sbobyn.github.io/three-pathtracer/

![Path tracer demo](three-pathtracer.gif)

## Lineage

This project continues the original public
[Three.js Pathtracer](https://github.com/sbobyn/three-pathtracer). It preserves
that repository's Git history while evolving into a broader educational
rendering lab for path tracing, editor architecture, BVH visualization, mesh
rendering, WebGL/WebGPU comparisons, and raster approximations.

## Current capabilities

The path tracer currently supports:

- sphere and bounded-quad intersections with UVs and oriented normals
- diffuse, metal, and dielectric materials
- constant, checker, image, and procedural Perlin textures
- spherical and box-projected sphere UV mapping
- authorable emissive quad and sphere lights with intensity and sidedness controls
- Cornell-box and black-background emissive-lighting study presets
- depth of field / defocus blur
- progressive ping-pong accumulation with selectable 8-bit, 16-bit float, and 32-bit float storage
- bounded accumulation and reset after camera, setting, material, or geometry changes

The Three.js application provides:

- a `THREE.Scene` scene graph for scene and camera management
- a switchable raster preview
- orbit camera controls
- raycaster-based object selection
- transform controls for selected objects
- selection outlines via `OutlinePass`
- a React editor UI for renderer settings, scene hierarchy, contextual object editing, and undo/redo
- sphere creation, selection, transforms, rename, duplicate, and deletion
- persistent, versioned lightweight editor preferences

## Architecture

The editable `THREE.Scene` is the authoritative authoring scene. Application
actions perform edits and classify their renderer invalidation consequences. A
`SceneCompiler` derives renderer-owned `GpuScene` data rather than making the
editor mutate uniforms directly. The path-tracing shader is split into focused
camera, geometry, material, texture, sampling, integration, and accumulation
modules under `src/pathtracer/shaders/`.

React owns presentation and ephemeral interface state. It does not own mutable
Three.js objects, compiled scene data, GPU resources, or accumulation buffers.

## Saved preferences

The editor saves a versioned preference record under the local-storage key
`three-pathtracer.preferences`. The current schema stores the last preset and
the lightweight render, camera, background, and transform-mode settings in
`PtSettings`.

Scene objects, imported assets, selection, undo history, GPU resources,
compiled scene data, BVHs, and accumulation buffers are deliberately excluded.
Missing or invalid fields fall back to current defaults, and unknown schema
versions are ignored. **Reset preferences** clears the record and reloads the
application with authoritative defaults.

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

`pnpm verify` runs unit tests, the random-seed precision check, TypeScript
checking, and the production build.

## Verified baseline

The baseline has been manually verified in a Chromium browser on macOS with Three.js r177 and WebGL:

- `Part1Simple` renders in raster and path-traced modes.
- `Part1Final` renders in raster and path-traced modes.
- `TextureStudy` exercises image, checker, and Perlin textures plus sphere UV mapping.
- `QuadStudy` exercises bounded quad intersection, quad UVs, and mixed sphere/quad closest-hit behavior.
- `EmissiveStudy` exercises authored quad/sphere emitters against a procedural floor and reflective/diffuse objects on a black environment.
- orbit controls, object selection, object lifecycle commands, transforms, material editing, resolution scale, accumulation controls, and depth-of-field controls respond without browser warnings or errors.
- unit tests, random-seed verification, TypeScript checking, and the production Vite build pass.

Known baseline limitations:

- `Part1Final` uses `Math.random()`, so its scene and reference image vary between reloads.
- Visual verification is manual; there is no automated image-regression suite yet.
- The production bundle currently triggers Vite's non-blocking warning for a chunk larger than 500 kB.
- Environment-map lighting, triangles, BVH traversal, mesh rendering, and direct-light importance sampling are not implemented yet.
- A WebGL-capable browser is required. There is no WebGPU backend yet.

## Roadmap

Broad future directions include:

- add environment lighting and analytic light types
- add explicit light sampling and multiple importance sampling
- original triangle intersection and mesh data paths
- BVH construction, traversal, and visualization
- glTF mesh rendering built on the triangle, BVH, material, and texture systems
- extend the authoritative scene/compiler and React editor workflows to new primitives and lights
- a WebGPU backend and reproducible WebGL/WebGPU benchmarks
- rasterized approximations for side-by-side quality and performance comparisons

External projects may inform architecture research, but code and renderer design remain original unless attribution explicitly says otherwise.
