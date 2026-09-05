# Showcase captures

Captured from Path Tracer Lab at source commit `6549aea` on September 4, 2026, using an isolated Chrome session. The collage combines real application output with caption strips. No generated imagery, denoising, relighting, or synthetic ray/geometry overlays were added. Cropping and resizing were used for layout; the collage is compressed as WebP and individual tiles are PNGs.

| Image | Scene and capture settings |
| --- | --- |
| [Global illumination · MIS](cornell.png) | CornellBox; offline path tracing; 800 × 600; 512 samples; depth 8; MIS; 32-bit accumulation; 38° FOV. Demonstrates indirect lighting, not a matched convergence-speed benchmark. |
| [Transmission · Dispersion](dragon.png) | KhronosDragonDispersion; offline path tracing; 800 × 600; 512 samples; depth 8; MIS; 32-bit accumulation; authored camera and Meadow environment. Visible residual noise is retained. |
| [glTF · Raster / path traced](helmet.png) | DamagedHelmetStudy; offline Comparison; 800 × 600; 256 samples; depth 8; MIS; divider at 50%. Meadow environment. |
| [Selective path tracing](selected.png) | TextureStudy; offline Selected comparison; central metal sphere selected; 800 × 600; 256 samples; depth 8; MIS; divider at 50%. The surrounding objects remain rasterized. |
| [Inspect camera rays](rays.png) | RTIOW1Simple; live capture including panels; Camera Rays panel cropped from the full image; five representative rays, depth 3, BVH bounds off; debug orbit camera adjusted for framing. |
| [Explore BVH traversal](bvh.png) | PackedTrianglesStudy; live raster capture including the debug overlay layer; 2,048-triangle wave; BVH visible depth 3; picked ray at NDC (0, −0.12); camera orbited after picking; environment background hidden. Final traversal step: 36 node tests, 8 primitive tests, triangle 1247 hit, agrees with brute force. This is a CPU reference diagnostic, not GPU pixel readback. |

## Emissive Study hero demo

[MP4](emissive-demo.mp4) · [Animated preview](emissive-demo.gif) · [Static poster](emissive-demo-poster.jpg)

User-recorded retake from `emissive-demo-new.mov`, supplied in commit `91f152e`. Shows the revised emissive scene, comparison divider, camera movement, and camera-ray visualization. Source: 1734 × 1402, 120 fps, 13.98 seconds. Web copy: H.264 MP4, 1280 × 1034, 30 fps, CRF 22, fast-start enabled. The GIF is 660 × 534 at 10 fps. No speed changes, synthetic frames, or denoising; displayed application FPS is not a benchmark. The original MOV is retained.

## CPU BVH ray-traversal demo

[MP4](bvh-traversal-viz.mp4) · [Animated preview](bvh-traversal-viz.gif) · [Static poster](bvh-traversal-viz-poster.jpg)

User-recorded `bvh-traversal-viz.mov`, supplied in commit `91f152e`. Demonstrates the packed-triangle scene's BVH bounds and CPU “Pick ray” traversal visualization. This mirrors the reference traversal algorithm over the production flattened BVH, not a live GPU pixel readback. Source: 1734 × 1402, 120 fps, 27.435 seconds. Web copy: H.264 MP4, 1280 × 1034, 30 fps, CRF 22, fast-start enabled; GIF: 660 × 534 at 10 fps. Timing is unchanged and the original MOV is retained.

## RTIOW Final demo

[MP4](interactive-demo.mp4) · [Animated preview](interactive-demo.gif) · [Static poster](interactive-demo-poster.jpg)

A 25-second recording of the running development app in Chrome at 1100 × 800. RTIOW1Final, framed at 30° FOV, demonstrates Comparison mode, divider dragging, and camera orbit with five diagnostic rays at depth 3. Partway through, the debug viewport's BVH toggle is enabled and visible BVH depth increased to 2. Interactions use browser pointer events and UI button clicks. Frame timestamps preserve actual elapsed time; there are no speedups or synthesized intermediate frames. The MP4 is encoded at 30 fps; the GIF preview is reduced to 660 × 480 at 10 fps. Visible sampling noise during motion is retained. The displayed FPS is device- and capture-dependent, not a performance benchmark.

## Dense sphere-BVH demo

[MP4](sphere-bvh-demo.mp4) · [Animated preview](sphere-bvh-demo.gif) · [Static poster](sphere-bvh-demo-poster.jpg)

An additional real-time recording of scene 10, `RTIOW1SphereBvhStudy`, using the same 1100 × 800 capture, 30° FOV, comparison-divider sweep, and camera orbits. Five diagnostic rays use bounce depth 3. Debug BVH bounds are enabled partway through, then visible BVH depth increases from 2 to 4. This is the dense, seeded sphere-field preset, not an artificially duplicated image. The original RTIOW Final recording is retained. Encoding and timing treatment match the first demo; visible sampling noise and device-dependent performance are retained.

## Credits

- Dragon Dispersion: Stanford Computer Graphics Laboratory dragon geometry, Morgan McGuire conversion, and Adobe cloth backdrop, distributed through Khronos glTF Sample Assets. See the [preserved license notice](../../src/assets/gltf/khronos-pbr/DragonDispersion.LICENSE.md) and [Stanford terms](../../src/assets/LICENSES/LicenseRef-Stanford-Graphics.txt), including restrictions on commercial use of models and images.
- Damaged Helmet: Leonard Teo / Khronos glTF Sample Assets. See the [included license notice](../../static/models/damaged-helmet/LICENSE.md).
- Meadow HDR environment: Sergej Majboroda / Poly Haven, CC0. The BVH scene uses Relax Inn Seaview Suite lighting by Dario Barresi and Jenelle van Heerden / Poly Haven, CC0, with its camera background hidden.
- Cornell box, texture studies, and wave scene are authored in this project. The teapot uses Three.js TeapotGeometry. See [asset provenance](../../src/assets/README.md) for the source collection.

The source-code MIT license does not replace third-party asset licenses. These images inherit applicable source-asset conditions.
