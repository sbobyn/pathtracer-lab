vec3 rayAt(Ray ray, float t) { return ray.origin + t * ray.direction; }
float lengthSquared(vec3 value) { return dot(value, value); }
bool intervalSurrounds(Interval interval, float value) { return interval.min < value && value < interval.max; }

void setFaceNormal(Ray ray, vec3 outwardNormal, inout Hit hit) {
    hit.frontFace = dot(ray.direction, outwardNormal) < 0.0;
    hit.normal = hit.frontFace ? outwardNormal : -outwardNormal;
}

vec2 sphereUv(vec3 outwardNormal) {
    float u = atan(outwardNormal.z, outwardNormal.x) / (2.0 * PI) + 0.5;
    float v = asin(clamp(outwardNormal.y, -1.0, 1.0)) / PI + 0.5;
    return vec2(u, v);
}

bool hitSphere(Sphere sphere, Ray ray, Interval rayInterval, out Hit hit) {
    vec3 toSphere = sphere.position - ray.origin;
    float a = lengthSquared(ray.direction);
    float h = dot(ray.direction, toSphere);
    float c = lengthSquared(toSphere) - sphere.radius * sphere.radius;
    float discriminant = h * h - a * c;
    if (discriminant < 0.0) return false;
    float sqrtDiscriminant = sqrt(discriminant);
    float root = (h - sqrtDiscriminant) / a;
    if (!intervalSurrounds(rayInterval, root)) {
        root = (h + sqrtDiscriminant) / a;
        if (!intervalSurrounds(rayInterval, root)) return false;
    }
    hit.t = root;
    hit.position = rayAt(ray, hit.t);
    vec3 outwardNormal = (hit.position - sphere.position) / sphere.radius;
    hit.uv = sphereUv(outwardNormal);
    setFaceNormal(ray, outwardNormal, hit);
    return true;
}

bool hitWorld(World world, Ray ray, Interval rayInterval, out Hit hit) {
    Hit candidate;
    bool hitAnything = false;
    float closestSoFar = rayInterval.max;
    for (int i = 0; i < MAX_SPHERES; i++) {
        if (i >= uSphereCount) break;
        Sphere sphere = world.spheres[i];
        if (hitSphere(sphere, ray, Interval(rayInterval.min, closestSoFar), candidate)) {
            hitAnything = true;
            closestSoFar = candidate.t;
            hit = candidate;
            hit.materialId = sphere.materialId;
        }
    }
    return hitAnything;
}
