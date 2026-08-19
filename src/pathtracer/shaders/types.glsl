struct Camera { vec3 position; vec3 forward; vec3 up; vec3 right; float halfWidth; float halfHeight; float focusDistance; float aperture; };
struct Ray { vec3 origin; vec3 direction; };
struct Sphere { vec3 position; float radius; int materialId; };
struct World { Sphere spheres[MAX_SPHERES]; };
struct Material { int type; vec3 albedo; float fuzz; float ior; };
struct Hit { float t; vec3 position; vec3 normal; bool frontFace; int materialId; };
struct Interval { float min; float max; };
