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

Recorded from the running development app with the revised orange Utah teapot in `EmissiveStudy`. Chrome viewport: 1100 × 800; authored 45° FOV; MIS; manual 0.75 resolution scale. The sequence enables debug BVH bounds, orbits the scene camera out and back, changes BVH depth 2→3→4→3, ray count 5→15→1→5, and ray bounce depth 3→5→10→3, then sweeps the comparison divider from near the left edge to near the right edge and back. Pauses show the teapot fully path traced and the metal sphere fully rasterized, ending on path-traced output. Actual frame timestamps are preserved without speedups; MP4 is encoded at 30 fps with CRF 18 and the 880 × 640 GIF at 12 fps. Sampling noise is retained, and displayed FPS is not a benchmark. Earlier demo variants remain available below.

The latest hero includes a reddish emissive sphere on the left and a roughly 16-second sequence with swift actual camera/divider movements and brief control demonstrations, not accelerated playback. It uses a closer over-the-shoulder debug camera: position (3.8, 3.6, 8.8), aimed at (0, 0.9, 1.8). This is recording-specific framing, not a change to the app's default debug camera.

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
