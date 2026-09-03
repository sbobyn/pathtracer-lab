<p align="center">
  <img src="static/pathtracer-lab-logo.svg" alt="Pathtracer Lab" width="360" />
</p>

# Path Tracer Lab

<!-- Hero image or GIF -->

An educational path tracer that runs interactively in the browser, built with Three.js, React, GLSL, and WebGL2.

This project began as a continuation of my [three-pathtracer](https://github.com/sbobyn/three-pathtracer) project, which followed Peter Shirley’s [Ray Tracing in One Weekend](https://raytracing.github.io/) with adaptations for interactive rendering through WebGL, plus overlays and editing helpers provided by a parallel Three.js scene.

It now has a broader purpose: to be an inspectable environment for learning how modern renderers are designed—from light transport and sampling to physically based materials, acceleration structures, GPU data layouts, scene compilation, and interactive editor architecture.

The current renderer supports spheres, quads, triangle meshes, glTF assets, image and procedural textures, emissive geometry, analytic lights, HDR environments, physically based materials, multiple sampling strategies, progressive accumulation, and a custom BVH implementation. The editor includes scene and object inspectors, transform controls, material editing, render settings, and debugging visualizations for triangle meshes, BVH nodes, and individual ray traversals.

The project also includes a conventional Three.js rasterized preview of each scene. This provides a responsive editing view and makes it possible to compare rasterization and path tracing directly.

Scenes are arranged roughly in the order that their underlying techniques were introduced.

Each scene includes a short description of what it demonstrates, relevant implementation details or math, and suggestions for what to observe while experimenting with its settings. Renderer controls also include tooltips explaining important parameters, their visual effects, and their likely performance costs.

## Current Features

- Progressive path-traced rendering with configurable ray depth, samples per frame, resolution, accumulation precision, and frame limit
- BSDF-only, direct-light, and multiple importance sampling integrators
- Spheres, quads, triangles, and indexed triangle meshes
- A custom BVH with selectable BVH or brute-force traversal
- Lambertian, metallic, dielectric, emissive, and principled materials
- Image, checker, Perlin noise, marble, and imported glTF textures
- Point, spot, directional, and emissive-geometry lighting
- HDR environment backgrounds and importance-sampled environment lighting
- glTF mesh, texture, and physically based material import
- A Three.js rasterized preview for comparison and interaction
- Scene, object, material, camera, and render inspectors
- Transform gizmos, object authoring, and an undo/redo stack
- Triangle, BVH, and ray-traversal debugging overlays

> The undo/redo history currently resets when the browser is refreshed.

## Included Scenes

- The initial and final scenes from _Ray Tracing in One Weekend_
- UV orientation, image texture, checker, and Perlin noise studies
- Quad and triangle intersection studies
- A Cornell box for comparing BSDF sampling, direct-light sampling, and MIS
- Emissive-geometry and analytic-light studies
- HDR environment lighting and importance sampling
- Packed triangle meshes and custom BVH traversal
- BVH construction and ray-traversal visualizations
- A larger BVH-accelerated sphere scene
- glTF box, Suzanne, and Damaged Helmet studies
- Physically based material and multi-material glTF tests

## Screenshots and Demos

<!-- Add screenshots and GIFs here -->
