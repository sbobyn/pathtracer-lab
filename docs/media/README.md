# Showcase captures

Captured from the deployed `main` build at commit `148423b` on September 6, 2026, using isolated Chrome sessions. The collage combines application output with caption strips. No generated imagery, denoising, relighting, or synthetic ray/geometry overlays were added. Cropping and resizing were used for layout; the collage is WebP and individual tiles are PNGs. Recordings include a rendered arrow cursor following the recorded mouse input.

| Image | Scene and capture settings |
| --- | --- |
| [Global illumination · MIS](cornell.png) | CornellBox; offline path tracing; 800 × 600; 512 samples; depth 10; MIS; 32-bit accumulation; 38° FOV; black sky and horizon. Demonstrates indirect lighting, not a matched convergence-speed benchmark. |
| [Transmission · Dispersion](dragon.png) | KhronosDragonDispersion; offline path tracing; 800 × 600; 512 samples; depth 10; MIS; 32-bit accumulation; 38° FOV; Meadow environment. Visible residual noise is retained. |
| [glTF · Raster / path traced](helmet.png) | DamagedHelmetStudy; offline Comparison; 800 × 600; 512 samples; depth 10; MIS; 32-bit accumulation; 42° FOV; divider at 50%; Meadow environment. |
| [Selective path tracing](selected.png) | TextureStudy; offline Selected comparison; central metal sphere selected; 800 × 600; 512 samples; depth 10; MIS; 32-bit accumulation; 48° FOV; divider at 50%. Surrounding objects remain rasterized. |
| [Inspect camera rays](rays.png) | EmissiveStudy; browser screenshot cropped to the Camera Rays panel; five representative rays, depth 3, BVH bounds off; current reset-view framing and toolbar. |
| [CPU BVH traversal](bvh.png) | PackedTrianglesStudy; browser screenshot of raster output, BVH overlay, and traversal controls; 2,048-triangle wave; BVH visible depth 3; picked ray at NDC (−0.3, −0.12); final traversal step; camera orbited after picking; environment background hidden. This is a CPU diagnostic, not GPU pixel readback. |

## Emissive Study hero demo

[Animated preview](emissive-demo.gif) · [Static poster](emissive-demo-poster.jpg)

Recaptured from the live deployment on September 8, 2026. Sweeps the comparison divider across the teapot and metal sphere, enables debug BVH bounds, moves the scene camera out and back, and disables the debug bounds. Then clicks the teapot with the CPU ray picker, makes a small camera orbit to reveal the ray, briefly plays the traversal, and quickly scrubs its step slider to the end. The picked triangle agrees with the brute-force diagnostic. Comparison rendering stays active throughout; a rendered arrow cursor follows the recorded input, with eased travel between controls and brief pauses before clicks. Recorded at 0.75× resolution, one sample per frame, depth 8, and MIS. The approximately 18-second GIF is 800 × 600 at 15 fps with original playback timing. A 1000 × 750, 30-fps MP4 is kept outside the repository for social posts. Noise during camera movement is retained; displayed application FPS is not a benchmark.

## CPU BVH ray-traversal demo

[Animated preview](bvh-traversal-viz.gif) · [Static poster](bvh-traversal-viz-poster.jpg)

Recaptured from the live deployment on September 8, 2026. Demonstrates the packed-triangle scene in Comparison mode: raster on the left 25%, path tracing on the right, with BVH bounds and picked-ray traversal overlaid. HDR environment lighting remains enabled with its camera background hidden. Recorded at 0.75× resolution, one sample per frame, depth 8, and MIS. Picks a ray, plays its complete traversal at Fast speed, and orbits the result. A rendered arrow cursor follows the recorded input with eased travel between controls. The picked triangle agrees with the brute-force diagnostic. The traversal uses the CPU reference algorithm over the production flattened BVH, not GPU pixel readback. The approximately 14-second GIF is 800 × 600 at 20 fps with original playback timing. A 1000 × 750, 30-fps MP4 is kept outside the repository for social posts.

## Credits

- Dragon Dispersion: Stanford Computer Graphics Laboratory dragon geometry, Morgan McGuire conversion, and Adobe cloth backdrop, distributed through Khronos glTF Sample Assets. See the [preserved license notice](../../src/assets/gltf/khronos-pbr/DragonDispersion.LICENSE.md) and [Stanford terms](../../src/assets/LICENSES/LicenseRef-Stanford-Graphics.txt), including restrictions on commercial use of models and images.
- Damaged Helmet: Leonard Teo / Khronos glTF Sample Assets. See the [included license notice](../../static/models/damaged-helmet/LICENSE.md).
- Meadow HDR environment: Sergej Majboroda / Poly Haven, CC0. The BVH scene uses Relax Inn Seaview Suite lighting by Dario Barresi and Jenelle van Heerden / Poly Haven, CC0, with its camera background hidden.
- Cornell box, texture studies, and wave scene are authored in this project. The teapot uses Three.js TeapotGeometry. See [asset provenance](../../src/assets/README.md) for the source collection.

The source-code MIT license does not replace third-party asset licenses. These images inherit applicable source-asset conditions.
