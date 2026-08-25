# GPU data layout

The WebGL path tracer keeps authored scene data as readable TypeScript objects, then serializes scalable records into RGBA32F `DataTexture` resources. GLSL 3 decoding functions use integer `texelFetch` coordinates, so filtering and normalized UV conventions cannot alter stored values.

Each resource is laid out linearly, row-major, and wrapped at the device's `MAX_TEXTURE_SIZE`. A record never depends on the physical row width: its linear texel address is converted to `(x, y)` by the shader.

## Triangles

Each triangle occupies eight RGBA texels:

| Offset | R | G | B | A |
| --- | --- | --- | --- | --- |
| 0 | `a.x` | `a.y` | `a.z` | material ID |
| 1 | `b.x` | `b.y` | `b.z` | unused |
| 2 | `c.x` | `c.y` | `c.z` | unused |
| 3 | normal A x | normal A y | normal A z | unused |
| 4 | normal B x | normal B y | normal B z | unused |
| 5 | normal C x | normal C y | normal C z | unused |
| 6 | UV A u | UV A v | UV B u | UV B v |
| 7 | UV C u | UV C v | unused | unused |

## Materials

Each material occupies two RGBA texels:

| Offset | R | G | B | A |
| --- | --- | --- | --- | --- |
| 0 | material model | base-color texture ID | emission texture ID | roughness |
| 1 | index of refraction | emission strength | two-sided emission flag | unused |

This is a WebGL storage layout, not the authored material model. `GpuMaterial`
defines the renderer-level meaning of these fields; a future WebGPU backend may
encode the same semantics in storage buffers rather than reproduce this texture
layout. Base color and emission have independent texture references so visible
emission is not coupled to the surface scattering color.

## Texture descriptors

Procedural and image-texture descriptors occupy three RGBA texels. Image pixels remain in their own texture resources.

| Offset | R | G | B | A |
| --- | --- | --- | --- | --- |
| 0 | type | image ID | scale | turbulence |
| 1 | color A r | color A g | color A b | unused |
| 2 | color B r | color B g | color B b | unused |

Integer identifiers are encoded as floats and rounded when decoded. This is exact for the scene sizes supported here. Packers reject records that exceed the maximum 2D texture dimensions reported by the active WebGL2 device.

## Triangle BVH

The CPU builder emits depth-first nodes and a separate triangle-index list. Each node uses two RGBA texels:

| Offset | R | G | B | A |
| --- | --- | --- | --- | --- |
| 0 | bounds min x | bounds min y | bounds min z | payload |
| 1 | bounds max x | bounds max y | bounds max z | triangle count |

A positive triangle count marks a leaf, where `payload` is the first offset in the triangle-index texture. A zero count marks a branch: its left child is the next node and `payload` is its right-child node index. The iterative shader traversal uses a fixed stack of 64 entries. If it encounters stack overflow or malformed indices it falls back to brute-force triangle traversal so geometry is not silently omitted.

Spheres, quads, lights, and the four image samplers still use the earlier bounded uniforms. They can migrate independently when their authored counts justify it; triangle and material storage no longer depend on those limits.
