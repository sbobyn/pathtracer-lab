# Showcase captures

Captured from Path Tracer Lab at source commit `6549aea` on September 4, 2026, using an isolated Chrome session. The collage combines real application output with caption strips. No generated imagery, denoising, relighting, or synthetic ray/geometry overlays were added. Cropping and resizing were used for layout; the collage is compressed as WebP and individual tiles are PNGs.

The Cornell tile was recaptured on September 4, 2026 with black sky and horizon, using the settings below.

| Image | Scene and capture settings |
| --- | --- |
| [Global illumination · MIS](cornell.png) | CornellBox; offline path tracing; 800 × 600; 512 samples; depth 8; MIS; 32-bit accumulation; 38° FOV. Demonstrates indirect lighting, not a matched convergence-speed benchmark. |
| [Transmission · Dispersion](dragon.png) | KhronosDragonDispersion; offline path tracing; 800 × 600; 512 samples; depth 8; MIS; 32-bit accumulation; authored camera and Meadow environment. Visible residual noise is retained. |
| [glTF · Raster / path traced](helmet.png) | DamagedHelmetStudy; offline Comparison; 800 × 600; 256 samples; depth 8; MIS; divider at 50%. Meadow environment. |
| [Selective path tracing](selected.png) | TextureStudy; offline Selected comparison; central metal sphere selected; 800 × 600; 256 samples; depth 8; MIS; divider at 50%. The surrounding objects remain rasterized. |
| [Inspect camera rays](rays.png) | RTIOW1Simple; live capture including panels; Camera Rays panel cropped from the full image; five representative rays, depth 3, BVH bounds off; debug orbit camera adjusted for framing. |
| [Explore BVH traversal](bvh.png) | PackedTrianglesStudy; live raster capture including the debug overlay layer; 2,048-triangle wave; BVH visible depth 3; picked ray at NDC (0, −0.12); camera orbited after picking; environment background hidden. Final traversal step: 36 node tests, 8 primitive tests, triangle 1247 hit, agrees with brute force. This is a CPU reference diagnostic, not GPU pixel readback. |

## Emissive Study hero demo

[Animated preview](emissive-demo.gif) · [Static poster](emissive-demo-poster.jpg)

Shows the emissive scene, comparison divider, camera movement, and camera-ray visualization. The 14-second GIF is 660 × 534 at 10 fps, with original playback timing. Displayed application FPS is not a benchmark.

## CPU BVH ray-traversal demo

[Animated preview](bvh-traversal-viz.gif) · [Static poster](bvh-traversal-viz-poster.jpg)

Demonstrates the packed-triangle scene's BVH bounds and CPU “Pick ray” traversal visualization. This uses the reference traversal algorithm over the production flattened BVH, not live GPU pixel readback. The 27-second GIF is 660 × 534 at 10 fps, with original playback timing.

## Credits

- Dragon Dispersion: Stanford Computer Graphics Laboratory dragon geometry, Morgan McGuire conversion, and Adobe cloth backdrop, distributed through Khronos glTF Sample Assets. See the [preserved license notice](../../src/assets/gltf/khronos-pbr/DragonDispersion.LICENSE.md) and [Stanford terms](../../src/assets/LICENSES/LicenseRef-Stanford-Graphics.txt), including restrictions on commercial use of models and images.
- Damaged Helmet: Leonard Teo / Khronos glTF Sample Assets. See the [included license notice](../../static/models/damaged-helmet/LICENSE.md).
- Meadow HDR environment: Sergej Majboroda / Poly Haven, CC0. The BVH scene uses Relax Inn Seaview Suite lighting by Dario Barresi and Jenelle van Heerden / Poly Haven, CC0, with its camera background hidden.
- Cornell box, texture studies, and wave scene are authored in this project. The teapot uses Three.js TeapotGeometry. See [asset provenance](../../src/assets/README.md) for the source collection.

The source-code MIT license does not replace third-party asset licenses. These images inherit applicable source-asset conditions.
