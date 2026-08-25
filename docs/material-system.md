# Material System

The material pipeline separates imported/editor representations, path-tracer
semantics, compiled renderer data, and backend storage:

```text
Three.js or glTF material
          ↓ adapter
PtMaterialDefinition
          ↓ SceneCompiler
GpuMaterial
          ↓ backend encoder
WebGL packed textures / future WebGPU resources
          ↓ surface evaluation
BSDF and emission
```

Neither Three.js classes nor glTF JSON are the path tracer's internal material
architecture. Three.js provides the raster/editor preview, glTF provides an
interchange model, and `PtMaterialDefinition` owns path-tracing meaning.

## Learning models

The original project scenes remain explicit learning checkpoints:

- legacy Lambert;
- legacy fuzzy metal;
- legacy ideal dielectric;
- no-BSDF/emission-only surfaces.

These models retain the original RTIOW-derived algorithms rather than silently
changing when more mature materials are introduced. Compatibility getters and
the positional constructor are temporary migration adapters; new authored code
should use the named factories and structured definition.

## Independent surface inputs

A definition currently separates:

- base-color factor and texture;
- roughness;
- index of refraction;
- emission color/texture, strength, and sidedness;
- the scattering model.

Emission is not a scattering model. A no-BSDF material can emit without
scattering, while later physically based materials can scatter and emit at the
same hit. Normal maps will be shading-frame inputs rather than geometric shape
changes. Imported ambient-occlusion maps will remain optional compatibility
data because multiplying baked occlusion into path transport can double-darken
visibility already discovered by rays.

`evaluateSurface()` resolves material factors and textures once at a hit into
base color, emission, and a shading normal. BSDF code consumes that evaluated
surface rather than reaching back into texture storage. A future normal map can
therefore modify `Surface.shadingNormal` while intersection and visibility keep
using the geometric normal.

Color factors and color textures enter the renderer in linear working space.
Three.js marks image color maps as sRGB so texture sampling performs the decode;
procedural and constant colors are stored as linear values. Future scalar data
such as roughness, metallic, occlusion, and normal maps must remain non-color
data and must not receive an sRGB transform.

## BSDF contract

The shader boundary exposes matching operations for:

- evaluating a BSDF for two directions;
- sampling a direction and returning its BSDF value;
- evaluating the corresponding probability density;
- marking invalid and delta samples explicitly;
- evaluating emitted radiance independently.

Direct-light sampling and multiple importance sampling require the evaluator,
sampler, and PDF to describe the same distribution. `sampleBsdf()` returns a
direction, throughput weight, PDF, validity, and delta classification;
`evaluateBsdf()` and `bsdfPdf()` provide the matching queries used by explicit
light sampling. The legacy Lambert, fuzzy-metal, and dielectric algorithms are
implementations behind this boundary. Lambert currently has matching evaluation
and PDF support, while the two specular learning models are explicitly marked as
delta samples until their physically based successors are introduced.

## Backend boundary

`GpuMaterial` uses semantic names such as `model`, `baseColorTextureId`,
`emissionTextureId`, `roughness`, and `ior`. The current WebGL backend packs
those values into float textures as documented in
[`gpu-data-layout.md`](gpu-data-layout.md). A future WebGPU backend may use a
different byte layout without changing authored material or compiler semantics.
