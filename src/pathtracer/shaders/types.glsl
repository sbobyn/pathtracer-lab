struct Camera { vec3 position; vec3 forward; vec3 up; vec3 right; float halfWidth; float halfHeight; float focusDistance; float aperture; };
struct Ray { vec3 origin; vec3 direction; };
struct Sphere { vec3 position; float radius; int materialId; int uvMapping; };
struct Quad { vec3 q; vec3 u; vec3 v; vec3 normal; int materialId; };
struct World { Sphere spheres[MAX_SPHERES]; Quad quads[MAX_QUADS]; };
struct Material { int type; int textureId; float fuzz; float ior; float emissionStrength; };
struct Texture { int type; vec3 colorA; vec3 colorB; float scale; float turbulence; int imageId; };
struct Hit { float t; vec3 position; vec3 normal; vec2 uv; bool frontFace; int materialId; int primitiveId; };
struct Interval { float min; float max; };
