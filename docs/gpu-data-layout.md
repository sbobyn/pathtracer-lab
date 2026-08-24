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
| 0 | type | texture ID | fuzz | index of refraction |
| 1 | emission strength | two-sided emission flag | unused | unused |

## Texture descriptors

Procedural and image-texture descriptors occupy three RGBA texels. Image pixels remain in their own texture resources.

| Offset | R | G | B | A |
| --- | --- | --- | --- | --- |
| 0 | type | image ID | scale | turbulence |
| 1 | color A r | color A g | color A b | unused |
| 2 | color B r | color B g | color B b | unused |

Integer identifiers are encoded as floats and rounded when decoded. This is exact for the scene sizes supported here. Packers reject records that exceed the maximum 2D texture dimensions reported by the active WebGL2 device.

Spheres, quads, lights, and the four image samplers still use the earlier bounded uniforms. They can migrate independently when their authored counts justify it; triangle and material storage no longer depend on those limits.
