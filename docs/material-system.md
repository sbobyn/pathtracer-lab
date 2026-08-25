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

## BSDF contract

The mature shader boundary will expose matching operations for:

- evaluating a BSDF for two directions;
- sampling a direction and returning its BSDF value;
- evaluating the corresponding probability density;
- marking invalid and delta samples explicitly;
- evaluating emitted radiance independently.

Direct-light sampling and multiple importance sampling require the evaluator,
sampler, and PDF to describe the same distribution. The current direction-only
legacy `scatter()` functions remain during migration, then become implementations
behind that explicit contract.

## Backend boundary

`GpuMaterial` uses semantic names such as `model`, `baseColorTextureId`,
`emissionTextureId`, `roughness`, and `ior`. The current WebGL backend packs
those values into float textures as documented in
[`gpu-data-layout.md`](gpu-data-layout.md). A future WebGPU backend may use a
different byte layout without changing authored material or compiler semantics.
