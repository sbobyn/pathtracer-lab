<p align="center">
  <img src="static/pathtracer-lab-logo.svg" alt="Pathtracer Lab" width="360" />
</p>

# Path Tracer Lab

An interactive browser lab for exploring light transport. Edit a scene, compare rasterization with path tracing, and follow the rays behind the image.

Built with Three.js, React, GLSL, and a custom WebGL2 path tracer.

[![Six captures from Path Tracer Lab: Cornell-box global illumination using MIS, dragon transmission and dispersion, glTF raster/path-traced comparison, selected-object comparison, camera-ray visualization, and BVH traversal](docs/media/showcase.webp)](docs/media/showcase.webp)

Captured with the app's offline renderer and capture tools. [Individual images, settings, and asset credits](docs/media/README.md). The traversal view is a CPU diagnostic of the production BVH; the dragon retains visible sampling noise.

[![Emissive Study demo: enable debug BVH, orbit with five camera rays, then sweep the comparison divider across an orange teapot and reflective sphere](docs/media/emissive-demo.gif)](docs/media/emissive-demo.mp4)

Explore the Emissive Study: orbit with debug BVH bounds, vary BVH depth, ray count and bounces, then sweep between raster and path-traced lighting and reflections. [Watch or download the 16-second demo (MP4)](docs/media/emissive-demo.mp4). Recorded at real speed; the looping preview has reduced resolution and frame rate.

Also watch the [dense sphere-BVH scene demo](docs/media/sphere-bvh-demo.mp4): the same interactions in scene 10, with debug BVH bounds enabled partway through.

## Explore, inspect, render

- **Edit in Three.js.** Add spheres, quads, analytic boxes, or a teapot; import a static GLB; adjust transforms and materials with undo/redo.
- **Compare rendering methods.** Switch between raster, path tracing, split comparison, region, and selected-object rendering. Trace part of the view to explore the quality/performance tradeoff.
- **See the algorithms.** Inspect camera rays and bounces, visualize the renderer's BVH, and step through an individual ray's traversal. Scene descriptions and tooltips explain what to look for.
- **Keep the result.** Capture the current view with optional overlays and panels, or render an offline still at a separate resolution and sample count. Preview progress, pause, cancel while retaining the partial image, and download PNGs.

## Rendering capabilities

Progressive accumulation with configurable samples, bounce depth, resolution, and precision; BSDF-only, direct-light, and multiple importance sampling; perspective and orthographic cameras with depth-of-field controls.

The renderer supports analytic spheres, quads and oriented boxes, indexed triangle meshes, custom sphere/triangle BVHs, image and procedural textures, emissive geometry, analytic point/spot/directional lights, and importance-sampled HDR environments. Materials include the original RTIOW learning models and principled metallic-roughness shading with rough transmission, volume attenuation, and dispersion.

## Run locally

Use **Node.js 22.22.2** (the verified development baseline) and **pnpm**. Rendering requires a browser and GPU with WebGL2 support; available precision and practical scene sizes depend on the device.

```sh
git clone https://github.com/sbobyn/pathtracer-lab.git
cd pathtracer-lab
pnpm install
pnpm dev
```

Open the URL printed by Vite, normally `http://localhost:3005/pathtracer-lab/`. If that port is occupied, Vite may select another. The shared editor UI package is included in `vendor/`; no sibling checkout is required.

Start with the default Cornell box comparison. Drag the divider, select an object to edit it, and open **Camera Rays** to inspect the scene. On small screens, use the bottom navigation to open one inspector at a time.

First-visit calibration chooses interactive settings for the scene and device. For smoother interaction during an offline render, switch the interactive view to Raster; both renderers still share the device's GPU.

```sh
pnpm verify  # Tests, RNG precision check, typecheck, production build
pnpm build   # Production files in dist/, served under /pathtracer-lab/
```

## Current boundaries

- **WebGL2 today.** WebGPU is planned. Responsive mobile controls are implemented; performance and compatibility vary by browser and device.
- **Scoped static glTF support.** Built-in assets and GLB import support triangle meshes, baked node transforms, multiple materials, and the implemented material inputs. Animation, skinning, morph targets, secondary UV sets, and texture transforms are unsupported. Normal maps, alpha/render-state fidelity, and advanced reflective lobes remain future work.
- **Four unique material images per scene.** The current WebGL image-sampler bridge has a fixed capacity; larger textured assets may exceed it.
- **Editing is session-based.** Preferences persist, but scene edits, undo history, and render history are not a saved project format. Download renders you want to keep.
- **Offline rendering is local.** It snapshots the current scene, camera, and settings. It can reduce interactive frame rate. Persistent authored cameras, video output, and denoising/upscaling are planned.
- **Comparison is educational.** Raster and path-traced output share scene data, but their lighting and transport approximations differ; pixel-identical results are not expected.

## How it is built

Three.js is the editable scene. Application actions manage edits and invalidation; `SceneCompiler` produces renderer-owned geometry, materials, lights, and acceleration data. The WebGL backend packs that data into GPU resources and renders through modular GLSL. React provides inspectors and controls.

The project continues [three-pathtracer](https://github.com/sbobyn/three-pathtracer), which began with Peter Shirley's [Ray Tracing in One Weekend](https://raytracing.github.io/). Its direction is an inspectable rendering lab: WebGPU parity next, then authored cameras, camera animation/video, and optional assisted post-processing.

## Credits and licensing

The project's source code is licensed under the [MIT License](LICENSE).

Bundled models, textures, environments, and dependencies retain their own licenses. See the [asset credits](src/assets/README.md) and [Khronos showcase notices](src/assets/gltf/khronos-pbr/README.md). Dragon geometry is credited to the Stanford Computer Graphics Laboratory; its included license contains non-commercial restrictions. Do not treat the entire asset collection as covered by the project's source-code license.
