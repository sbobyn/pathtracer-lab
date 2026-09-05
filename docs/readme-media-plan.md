# README media capture plan

The six-tile showcase collage remains in [media/showcase.webp](media/showcase.webp), with [individual PNGs and capture settings](media/README.md). The README now uses the user's new recordings: a [14-second Emissive Study demo](media/emissive-demo.gif) and a [27-second CPU picked-ray BVH traversal demo](media/bvh-traversal-viz.gif). Only the two README GIFs are retained as animated media; video files and unused GIFs were removed in favor of the [live app](https://pathtracer-lab.vercel.app/). The proposed helmet/dragon still refresh was stopped before replacing the collage. Earlier RTIOW animations remain recoverable from Git history. The concepts below are optional future expansions, not release blockers.

## Interactive hero video

Record 15–20 seconds at 1280 × 720 or 1920 × 1080. Begin with a converged Cornell box in Comparison mode. Sweep the divider over the teapot and boxes, orbit slightly, then change one visible material property and let the image settle. Keep the cursor visible, movements deliberate, and unrelated panels collapsed. Avoid calibration/loading delays. Select a poster frame showing both rendering methods.

## Inspection video

Record 15–20 seconds: Camera Rays with five rays and an over-the-shoulder view; briefly move the scene camera; then show BVH bounds and a few steps of a picked ray's traversal. A cut between camera and traversal demonstrations is fine. Keep the important labels readable.

## Render gallery

Six square offline PNGs in a 3 × 2 grid, with narrow gutters and consistent short labels. Start at 512 × 512 per tile and 256 samples; inspect each render and increase samples where noise obscures the effect.

| Label | Suggested scene | Show |
| --- | --- | --- |
| Indirect light | Cornell box | Color bleeding and soft area-light shadows |
| Metal & roughness | Principled material study | A clear roughness progression |
| Transmission | Focused transmission study | Refraction through glass |
| Volume attenuation | Dragon Attenuation | Thickness-dependent color |
| Dispersion | Dragon Dispersion | Visible color separation |
| Textures | Texture study | Image and procedural mapping |

Use clean renders without UI. Credit Stanford Computer Graphics Laboratory for dragon imagery and retain the asset notices; choose alternative fixtures if the included restrictions do not suit the intended use. Keep labels outside important image detail. Do not imply identical render settings if tiles used different settings.

## Tools collage

Four captures in a 2 × 2 grid: Comparison, Region rendering, Camera rays, BVH traversal. Include relevant overlays. Include panels only where their labels explain the demonstration. Capture large enough that the important controls remain readable at README width.

## Assembly

- Export collages as PNG or WebP and inspect at actual README display width.
- Add nearby captions with scene/asset credits.
- Give videos static poster images and usable links; verify playback in the rendered GitHub README before publication.
- The launch README media placeholders have been replaced with captures and a recording.
- Use the release build for captures; include device/settings context if showing performance claims.
