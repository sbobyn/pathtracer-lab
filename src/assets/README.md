# Texture assets

- `texture-study.svg` and `texture-grid.svg` are original diagnostic textures for this project.
- `earth-blue-marble.jpg` was recovered from Steven's earlier `tripy` renderer (`old_tripy/examples/textures/earth.bmp`) and converted from BMP to JPEG for the web. The image is a NASA Blue Marble world map; NASA's Visible Earth collection makes its imagery available to the public: https://visibleearth.nasa.gov/collection/1484/blue-marble
- `studio_small_03_2k.hdr` is [Studio Small 03](https://polyhaven.com/a/studio_small_03) by Greg Zaal.
- `meadow_2k.hdr` is [Meadow](https://polyhaven.com/a/meadow) by Sergej Majboroda.
- `belfast_sunset_puresky_2k.hdr` is [Belfast Sunset (Pure Sky)](https://polyhaven.com/a/belfast_sunset_puresky) by Dimitrios Savva, Greg Zaal, and Jarod Guest.
- `relax_inn_seaview_suite_4k.hdr` is [Relax Inn Seaview Suite](https://polyhaven.com/a/relax_inn_seaview_suite) by Dario Barresi and Jenelle van Heerden.

The HDR files above were downloaded from Poly Haven as built-in studio, outdoor, open-sky, and interior environment presets. Poly Haven publishes all of them under CC0. Most presets use 2K files to keep the repository and initial download reasonable; the default Relax Inn showcase uses 4K because its detailed interior is visibly clearer as a camera background.

`gltf/box/Box.glb` is the official Khronos glTF Sample Assets Box model by Cesium, used as the static glTF loader smoke test under CC BY 4.0. Its original license is preserved beside the asset.

`static/models/suzanne/` contains the official Khronos glTF Sample Assets Suzanne model by UX3D/Norbert Nopper under CC0. The separate glTF, buffer, and image files intentionally preserve their published relative layout; the original license is included in that directory. Its base-color and packed metallic-roughness inputs now exercise the principled material importer.

`static/models/damaged-helmet/` contains the official Khronos glTF Sample Assets Damaged Helmet by Leonard Teo under its included CC BY 4.0 / CC BY-NC 4.0 license notice. The binary glTF is kept intact as a richer material and mesh study, with its original license beside it. Base color, packed metallic-roughness, and independent emissive inputs are supported. Normal and occlusion maps remain explicit targets for the auxiliary glTF-material work.

`static/models/metal-rough-spheres-no-textures/` contains the official Khronos glTF Sample Assets MetalRoughSpheresNoTextures model by Analytical Graphics, Inc. under CC BY 4.0. Its 98 materials, 102 meshes, 123 primitives, and roughly 1.04 million triangles form an optional stress test of primitive-to-material assignment and factor-driven base color, metallic, and roughness behavior. It intentionally uses no image textures, keeping this material-association test independent of the WebGL image-sampler limit. The stress preset defaults to 0.125× resolution; a lightweight everyday regression fixture is deferred to STE-750. The source GLB remains unchanged, its small authored units are converted with an explicit import scale in the scene preset, and the original license is included beside it.

`static/models/simple-meshes/` contains the official Khronos glTF Sample Assets Simple Meshes model under CC0. Its two nodes reference the same indexed triangle mesh, providing a compact integration check that node transforms and shared mesh data are flattened correctly. The original license is included in that directory.
