vec3 rayAt(Ray ray, float t) { return ray.origin + t * ray.direction; }
float lengthSquared(vec3 value) { return dot(value, value); }
bool intervalSurrounds(Interval interval, float value) { return interval.min < value && value < interval.max; }

void setFaceNormal(Ray ray, vec3 outwardNormal, inout Hit hit) {
    hit.frontFace = dot(ray.direction, outwardNormal) < 0.0;
    hit.normal = hit.frontFace ? outwardNormal : -outwardNormal;
    hit.geometricNormal = hit.normal;
    hit.shadingNormal = hit.normal;
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
    hit.barycentrics = vec3(0.0);
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
    hit.barycentrics = vec3(1.0 - alpha - beta, alpha, beta);
    setFaceNormal(ray, quad.normal, hit);
    return true;
}

bool hitTriangle(Triangle triangle, Ray ray, Interval rayInterval, out Hit hit) {
    vec3 edgeAB = triangle.b - triangle.a;
    vec3 edgeAC = triangle.c - triangle.a;
    vec3 p = cross(ray.direction, edgeAC);
    float determinant = dot(edgeAB, p);
    if (abs(determinant) < 1e-8) return false;
    float inverseDeterminant = 1.0 / determinant;
    vec3 fromA = ray.origin - triangle.a;
    float baryB = dot(fromA, p) * inverseDeterminant;
    if (baryB < 0.0 || baryB > 1.0) return false;
    vec3 q = cross(fromA, edgeAB);
    float baryC = dot(ray.direction, q) * inverseDeterminant;
    if (baryC < 0.0 || baryB + baryC > 1.0) return false;
    float t = dot(edgeAC, q) * inverseDeterminant;
    if (!intervalSurrounds(rayInterval, t)) return false;

    vec3 barycentrics = vec3(1.0 - baryB - baryC, baryB, baryC);
    vec3 geometricNormal = normalize(cross(edgeAB, edgeAC));
    vec3 shadingNormal = normalize(barycentrics.x * triangle.normalA + barycentrics.y * triangle.normalB + barycentrics.z * triangle.normalC);
    if (dot(shadingNormal, geometricNormal) < 0.0) shadingNormal = -shadingNormal;
    hit.t = t;
    hit.position = rayAt(ray, t);
    hit.barycentrics = barycentrics;
    hit.uv = barycentrics.x * triangle.uvA + barycentrics.y * triangle.uvB + barycentrics.z * triangle.uvC;
    hit.frontFace = dot(ray.direction, geometricNormal) < 0.0;
    hit.geometricNormal = hit.frontFace ? geometricNormal : -geometricNormal;
    hit.shadingNormal = hit.frontFace ? shadingNormal : -shadingNormal;
    hit.normal = hit.shadingNormal;
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
            hit.primitiveType = 0;
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
            hit.primitiveType = 1;
            hit.primitiveId = i;
        }
    }
    for (int i = 0; i < MAX_TRIANGLES; i++) {
        if (i >= uTriangleCount) break;
        Triangle triangle = world.triangles[i];
        if (hitTriangle(triangle, ray, Interval(rayInterval.min, closestSoFar), candidate)) {
            hitAnything = true;
            closestSoFar = candidate.t;
            hit = candidate;
            hit.materialId = triangle.materialId;
            hit.primitiveType = 2;
            hit.primitiveId = i;
        }
    }
    return hitAnything;
}
