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
    float u = fract(atan(-outwardNormal.z, outwardNormal.x) / (2.0 * PI) + 0.5);
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

bool hitBox(Box box, Ray ray, Interval rayInterval, out Hit hit) {
    vec3 relativeOrigin = ray.origin - box.center;
    vec3 localOrigin = vec3(
        dot(relativeOrigin, box.axisX),
        dot(relativeOrigin, box.axisY),
        dot(relativeOrigin, box.axisZ)
    );
    vec3 localDirection = vec3(
        dot(ray.direction, box.axisX),
        dot(ray.direction, box.axisY),
        dot(ray.direction, box.axisZ)
    );
    float nearT = rayInterval.min;
    float farT = rayInterval.max;
    int nearAxis = -1;
    int farAxis = -1;
    float nearSign = 0.0;
    float farSign = 0.0;
    for (int axis = 0; axis < 3; axis++) {
        if (abs(localDirection[axis]) < 1e-12) {
            if (localOrigin[axis] < -box.halfSize[axis] || localOrigin[axis] > box.halfSize[axis]) return false;
            continue;
        }
        float inverseDirection = 1.0 / localDirection[axis];
        float axisNear = (-box.halfSize[axis] - localOrigin[axis]) * inverseDirection;
        float axisFar = (box.halfSize[axis] - localOrigin[axis]) * inverseDirection;
        float axisNearSign = -1.0;
        float axisFarSign = 1.0;
        if (axisNear > axisFar) {
            float swapT = axisNear; axisNear = axisFar; axisFar = swapT;
            float swapSign = axisNearSign; axisNearSign = axisFarSign; axisFarSign = swapSign;
        }
        if (axisNear > nearT) { nearT = axisNear; nearAxis = axis; nearSign = axisNearSign; }
        if (axisFar < farT) { farT = axisFar; farAxis = axis; farSign = axisFarSign; }
        if (farT < nearT) return false;
    }
    bool useNear = nearAxis >= 0 && intervalSurrounds(rayInterval, nearT);
    float t = useNear ? nearT : farT;
    int hitAxis = useNear ? nearAxis : farAxis;
    float hitSign = useNear ? nearSign : farSign;
    if (hitAxis < 0 || !intervalSurrounds(rayInterval, t)) return false;

    vec3 localNormal = vec3(0.0);
    localNormal[hitAxis] = hitSign;
    vec3 outwardNormal = normalize(
        localNormal.x * box.axisX + localNormal.y * box.axisY + localNormal.z * box.axisZ
    );
    vec3 localHit = localOrigin + t * localDirection;
    vec3 normalizedHit = localHit / max(box.halfSize, vec3(1e-8));
    hit.t = t;
    hit.position = rayAt(ray, t);
    hit.uv = boxUv(normalizedHit);
    hit.barycentrics = vec3(0.0);
    setFaceNormal(ray, outwardNormal, hit);
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

bool hitAabb(vec3 boundsMin, vec3 boundsMax, Ray ray, Interval interval) {
    for (int axis = 0; axis < 3; axis++) {
        float origin = ray.origin[axis];
        float direction = ray.direction[axis];
        if (abs(direction) < 1e-12) {
            if (origin < boundsMin[axis] || origin > boundsMax[axis]) return false;
            continue;
        }
        float inverseDirection = 1.0 / direction;
        float nearDistance = (boundsMin[axis] - origin) * inverseDirection;
        float farDistance = (boundsMax[axis] - origin) * inverseDirection;
        if (nearDistance > farDistance) {
            float swapDistance = nearDistance;
            nearDistance = farDistance;
            farDistance = swapDistance;
        }
        interval.min = max(interval.min, nearDistance);
        interval.max = min(interval.max, farDistance);
        if (interval.max < interval.min) return false;
    }
    return true;
}

bool hitTrianglesBruteForce(Ray ray, Interval rayInterval, inout Hit hit, inout float closestSoFar) {
    Hit candidate;
    bool hitAnything = false;
    for (int i = 0; i < uTriangleCount; i++) {
        Triangle triangle = readTriangle(i);
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

bool hitSpheresBruteForce(Ray ray, Interval rayInterval, inout Hit hit, inout float closestSoFar) {
    Hit candidate;
    bool hitAnything = false;
    for (int i = 0; i < uSphereCount; i++) {
        Sphere sphere = readSphere(i);
        if (hitSphere(sphere, ray, Interval(rayInterval.min, closestSoFar), candidate)) {
            hitAnything = true;
            closestSoFar = candidate.t;
            hit = candidate;
            hit.materialId = sphere.materialId;
            hit.primitiveType = 0;
            hit.primitiveId = i;
        }
    }
    return hitAnything;
}

const int BVH_STACK_SIZE = 64;

bool hitSpheresBvh(Ray ray, Interval rayInterval, inout Hit hit, inout float closestSoFar) {
    if (uSphereBvhNodeCount == 0) return false;
    int stack[BVH_STACK_SIZE];
    int stackSize = 1;
    stack[0] = 0;
    bool hitAnything = false;
    bool invalidTraversal = false;
    Hit candidate;
    while (stackSize > 0) {
        int nodeIndex = stack[--stackSize];
        if (nodeIndex < 0 || nodeIndex >= uSphereBvhNodeCount) {
            invalidTraversal = true;
            break;
        }
        vec3 boundsMin;
        vec3 boundsMax;
        int payload;
        int sphereCount;
        readSphereBvhNode(nodeIndex, boundsMin, boundsMax, payload, sphereCount);
        if (!hitAabb(boundsMin, boundsMax, ray, Interval(rayInterval.min, closestSoFar))) continue;
        if (sphereCount > 0) {
            for (int offset = 0; offset < sphereCount; offset++) {
                int sphereIndex = readSphereBvhIndex(payload + offset);
                if (sphereIndex < 0 || sphereIndex >= uSphereCount) {
                    invalidTraversal = true;
                    break;
                }
                Sphere sphere = readSphere(sphereIndex);
                if (hitSphere(sphere, ray, Interval(rayInterval.min, closestSoFar), candidate)) {
                    hitAnything = true;
                    closestSoFar = candidate.t;
                    hit = candidate;
                    hit.materialId = sphere.materialId;
                    hit.primitiveType = 0;
                    hit.primitiveId = sphereIndex;
                }
            }
            if (invalidTraversal) break;
            continue;
        }
        if (stackSize + 2 > BVH_STACK_SIZE) {
            invalidTraversal = true;
            break;
        }
        stack[stackSize++] = payload;
        stack[stackSize++] = nodeIndex + 1;
    }
    if (invalidTraversal) return hitSpheresBruteForce(ray, rayInterval, hit, closestSoFar) || hitAnything;
    return hitAnything;
}

bool hitTrianglesBvh(Ray ray, Interval rayInterval, inout Hit hit, inout float closestSoFar) {
    if (uBvhNodeCount == 0) return false;
    int stack[BVH_STACK_SIZE];
    int stackSize = 1;
    stack[0] = 0;
    bool hitAnything = false;
    bool invalidTraversal = false;
    Hit candidate;
    while (stackSize > 0) {
        int nodeIndex = stack[--stackSize];
        if (nodeIndex < 0 || nodeIndex >= uBvhNodeCount) {
            invalidTraversal = true;
            break;
        }
        vec3 boundsMin;
        vec3 boundsMax;
        int payload;
        int triangleCount;
        readBvhNode(nodeIndex, boundsMin, boundsMax, payload, triangleCount);
        if (!hitAabb(boundsMin, boundsMax, ray, Interval(rayInterval.min, closestSoFar))) continue;
        if (triangleCount > 0) {
            for (int offset = 0; offset < triangleCount; offset++) {
                int triangleIndex = readBvhTriangleIndex(payload + offset);
                if (triangleIndex < 0 || triangleIndex >= uTriangleCount) {
                    invalidTraversal = true;
                    break;
                }
                Triangle triangle = readTriangle(triangleIndex);
                if (hitTriangle(triangle, ray, Interval(rayInterval.min, closestSoFar), candidate)) {
                    hitAnything = true;
                    closestSoFar = candidate.t;
                    hit = candidate;
                    hit.materialId = triangle.materialId;
                    hit.primitiveType = 2;
                    hit.primitiveId = triangleIndex;
                }
            }
            if (invalidTraversal) break;
            continue;
        }
        if (stackSize + 2 > BVH_STACK_SIZE) {
            invalidTraversal = true;
            break;
        }
        stack[stackSize++] = payload;
        stack[stackSize++] = nodeIndex + 1;
    }
    // Correctness is more important than silently dropping geometry if a future
    // hierarchy exceeds the fixed shader stack or contains malformed indices.
    if (invalidTraversal) return hitTrianglesBruteForce(ray, rayInterval, hit, closestSoFar) || hitAnything;
    return hitAnything;
}

bool hitWorld(World world, Ray ray, Interval rayInterval, out Hit hit) {
    Hit candidate;
    bool hitAnything = false;
    float closestSoFar = rayInterval.max;
    bool hitSpheres = uTriangleTraversalMode == 1
        ? hitSpheresBvh(ray, rayInterval, hit, closestSoFar)
        : hitSpheresBruteForce(ray, rayInterval, hit, closestSoFar);
    hitAnything = hitSpheres || hitAnything;
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
    for (int i = 0; i < MAX_BOXES; i++) {
        if (i >= uBoxCount) break;
        Box box = world.boxes[i];
        if (hitBox(box, ray, Interval(rayInterval.min, closestSoFar), candidate)) {
            hitAnything = true;
            closestSoFar = candidate.t;
            hit = candidate;
            hit.materialId = box.materialId;
            hit.primitiveType = 3;
            hit.primitiveId = i;
        }
    }
    bool hitTriangles = uTriangleTraversalMode == 1
        ? hitTrianglesBvh(ray, rayInterval, hit, closestSoFar)
        : hitTrianglesBruteForce(ray, rayInterval, hit, closestSoFar);
    hitAnything = hitTriangles || hitAnything;
    return hitAnything;
}
