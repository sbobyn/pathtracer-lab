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

vec2 boxUv(vec3 normal) {
    vec3 axis = abs(normal);
    vec2 uv;
    if (axis.x >= axis.y && axis.x >= axis.z) {
        uv = normal.x >= 0.0 ? vec2(-normal.z, normal.y) : vec2(normal.z, normal.y);
    } else if (axis.y >= axis.z) {
        uv = normal.y >= 0.0 ? vec2(normal.x, -normal.z) : vec2(normal.x, normal.z);
    } else {
        uv = normal.z >= 0.0 ? vec2(normal.x, normal.y) : vec2(-normal.x, normal.y);
    }
    return uv * 0.5 + 0.5;
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
    hit.uv = sphere.uvMapping == 1 ? boxUv(outwardNormal) : sphereUv(outwardNormal);
    setFaceNormal(ray, outwardNormal, hit);
    return true;
}

bool hitQuad(Quad quad, Ray ray, Interval rayInterval, out Hit hit) {
    float denominator = dot(quad.normal, ray.direction);
    if (abs(denominator) < 1e-8) return false;
    float t = dot(quad.normal, quad.q - ray.origin) / denominator;
    if (!intervalSurrounds(rayInterval, t)) return false;

    vec3 planar = rayAt(ray, t) - quad.q;
    vec3 crossUv = cross(quad.u, quad.v);
    float crossLengthSquared = dot(crossUv, crossUv);
    if (crossLengthSquared < 1e-12) return false;
    vec3 w = crossUv / crossLengthSquared;
    float alpha = dot(w, cross(planar, quad.v));
    float beta = dot(w, cross(quad.u, planar));
    if (alpha < 0.0 || alpha > 1.0 || beta < 0.0 || beta > 1.0) return false;

    hit.t = t;
    hit.position = rayAt(ray, t);
    hit.uv = vec2(alpha, beta);
    setFaceNormal(ray, quad.normal, hit);
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
            hit.primitiveId = i;
        }
    }
    for (int i = 0; i < MAX_QUADS; i++) {
        if (i >= uQuadCount) break;
        Quad quad = world.quads[i];
        if (hitQuad(quad, ray, Interval(rayInterval.min, closestSoFar), candidate)) {
            hitAnything = true;
            closestSoFar = candidate.t;
            hit = candidate;
            hit.materialId = quad.materialId;
            hit.primitiveId = uSphereCount + i;
        }
    }
    return hitAnything;
}
