#ifndef MAX_SPHERES
#define MAX_SPHERES 1
#endif

precision highp float;

#define PI 3.141592653

// structs
struct Camera {
    vec3 position;
    vec3 forward;
    vec3 up;
    vec3 right;
    float halfWidth;
    float halfHeight;
    float focusDistance;
    float aperture;
};

struct Ray {
    vec3 origin;
    vec3 direction;
};

struct Sphere {
    vec3 position;
    float radius;
    int materialId;
};

struct World {
    Sphere spheres[MAX_SPHERES];
};

struct Material {
    int type; // 0: lambertian, 1: metal, 2: dielectric
    vec3 albedo;
    float fuzz; // (roughness) only for metal
    float ior; // (index of refraction) only for dielectric
};

struct Hit {
    float t;
    vec3 position;
    vec3 normal;
    bool frontFace;
    int materialId;
};

struct Interval {
    float min;
    float max;
};

// varyings
varying vec2 vNDC;

// uniforms
uniform vec2 uResolution;
uniform vec3 uBackgroundColorTop;
uniform vec3 uBackgroundColorBottom;
uniform int uMaxRayDepth;
uniform float uNumSamples;
uniform bool uEnableDoF;
uniform sampler2D uAccumTexture;
uniform int uFrameCount;
uniform vec2 uRandomSequence;

uniform Camera uCamera;
uniform World uWorld;
uniform Material uMaterials[MAX_SPHERES];

vec3 rayAt(Ray r, float t) {
    return r.origin + t * r.direction;
}

float lengthSquared(vec3 a) {
    return dot(a, a);
}

bool intervalSurrounds(Interval i, float x) {
    return i.min < x && x < i.max;
}

void setFaceNormal(Ray ray, vec3 outwardNormal, inout Hit hit) {
    hit.frontFace = dot(ray.direction, outwardNormal) < 0.0;
    hit.normal = hit.frontFace ? outwardNormal : -outwardNormal;
}

bool hitSphere(Sphere s, Ray r, Interval rayInt, out Hit hit) {
    vec3 toSphere = s.position - r.origin;
    float a = lengthSquared(r.direction);
    float h = dot(r.direction, toSphere);
    float c = lengthSquared(toSphere) - s.radius * s.radius;

    float discriminant = h * h - a * c;
    if (discriminant < 0.) {
        return false;
    }

    float sqrtD = sqrt(discriminant);

    // find nearest root in accepted range
    float root = (h - sqrtD) / a;
    if (!intervalSurrounds(rayInt, root)) { // no hit, try other root
        root = (h + sqrtD) / a;
        if (!intervalSurrounds(rayInt, root)) { // no hit
            return false;
        }
    }

    hit.t = root;
    hit.position = rayAt(r, hit.t);

    vec3 outwardN = (hit.position - s.position) / s.radius;
    setFaceNormal(r, outwardN, hit);
    return true;
}

bool hitWorld(World world, Ray ray, Interval rayInt, out Hit hit) {
    Hit tempHit;
    bool hitAnything = false;
    float closestSoFar = rayInt.max;

    for (int i = 0; i < MAX_SPHERES; i++) {
        Sphere sphere = world.spheres[i];

        if (hitSphere(sphere, ray, Interval(rayInt.min, closestSoFar), tempHit)) {
            hitAnything = true;
            closestSoFar = tempHit.t;
            hit = tempHit;
            hit.materialId = world.spheres[i].materialId;
        }
    }

    return hitAnything;
}

// vec3 rayColorNormal(Ray r, World w) {
//     Hit hit;
//     Interval rayInt = Interval(1e-3, 1e4);
//     bool didHit = hitWorld(w, r, rayInt, hit);

//     if (didHit) {
//         return 0.5 * (hit.normal + 1.);
//     }

//     vec3 unitDir = normalize(r.direction);
//     float a = 0.5 * (unitDir.y + 1.0);

//     return (1.0 - a) * vec3(1) + a * vec3(0.5, 0.7, 1);
// }

// source: Hash without Sine: https://www.shadertoy.com/view/4djSRW

float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * .1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

vec2 hash22(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973));
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.xx + p3.yz) * p3.zy);
}

vec3 hash32(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973));
    p3 += dot(p3, p3.yxz + 33.33);
    return fract((p3.xxy + p3.yzz) * p3.zyx);
}

vec3 randomOnUnitSphere(vec2 p) {
    vec3 rand = hash32(p);
    float phi = 2.0 * PI * rand.x;
    float cosTheta = 2.0 * rand.y - 1.0;

    float theta = acos(cosTheta);

    float x = sin(theta) * cos(phi);
    float y = sin(theta) * sin(phi);
    float z = cos(theta);

    return vec3(x, y, z);
}

vec2 sampleUnitDisk(vec2 u) {
    // Concentric mapping (uniform, low distortion)
    float a = 2.0 * u.x - 1.0;
    float b = 2.0 * u.y - 1.0;

    float r, phi;
    if (a == 0.0 && b == 0.0) {
        r = 0.0;
        phi = 0.0;
    } else if (abs(a) > abs(b)) {
        r = a;
        phi = (PI / 4.0) * (b / a);
    } else {
        r = b;
        phi = (PI / 2.0) - (PI / 4.0) * (a / b);
    }
    return r * vec2(cos(phi), sin(phi));
}

vec3 randomUnitVector(vec2 p) {
    return randomOnUnitSphere(p);
}

bool nearZero(vec3 p) {
    float s = 1e-8;
    return abs(p.x) < s && abs(p.y) < s && abs(p.z) < s;
}

vec3 scatterLambert(Hit hit, vec2 seed) {
    vec3 scatterDir = hit.normal + randomUnitVector(seed);
    if (nearZero(scatterDir)) { // catch degenerate scatter direction
        scatterDir = hit.normal;
    }
    return normalize(scatterDir);
}

vec3 scatterMetal(Ray rayIn, Hit hit, vec2 seed, float fuzz) {
    vec3 scatterDir = normalize(reflect(rayIn.direction, hit.normal));
    vec3 reflected = scatterDir + fuzz * randomUnitVector(seed);
    return dot(reflected, hit.normal) > 0.0 ? normalize(reflected) : scatterDir;
}

// Schlick approximation for reflectance
float reflectance(float cosine, float ior) {
    float r0 = (1. - ior) / (1. + ior);
    r0 = r0 * r0;
    return r0 + (1. - r0) * pow((1. - cosine), 5.);
}

vec3 scatterDielectric(Ray rayIn, Hit hit, vec2 seed) {
    float ior = hit.frontFace ? 1.0 / uMaterials[hit.materialId].ior : uMaterials[hit.materialId].ior;
    vec3 unitDir = normalize(rayIn.direction);

    float cosTheta = min(dot(-unitDir, hit.normal), 1.0);
    float sinTheta = sqrt(abs(1.0 - cosTheta * cosTheta) + 1e-4);

    bool cannotRefract = ior * sinTheta > 1.0; // glancing ray
    bool schlick = reflectance(cosTheta, ior) > hash12(seed);

    if (cannotRefract || schlick) {
        return reflect(unitDir, hit.normal);
    }

    else {
        return refract(unitDir, hit.normal, ior);
    }
}

vec3 scatter(Ray rayIn, Hit hit, vec2 seed) {
    if (uMaterials[hit.materialId].type == 0) { // lambertian
        return scatterLambert(hit, seed);
    } else if (uMaterials[hit.materialId].type == 1) { // metal
        float fuzz = uMaterials[hit.materialId].fuzz;
        return scatterMetal(rayIn, hit, seed, fuzz);
    } else if (uMaterials[hit.materialId].type == 2) { // dielectric
        return scatterDielectric(rayIn, hit, seed);
    }

    return vec3(0);
}

vec3 rayColor(Ray
    r, World
    w, vec2
    seed) {
    Hit hit;

    vec3 color = vec3(1);

    int depth;
    for (depth = 0; depth < uMaxRayDepth; depth++) {
        Interval rayInt = Interval(1e-3, 1e4);
        bool didHit = hitWorld(w, r, rayInt, hit);

        if (didHit) { // hit a sphere
            r.origin = hit.position;
            vec2 bounceSeed = seed + vec2(
                17.0 * float(depth) + 11.0,
                59.0 * float(depth) + 23.0
            );
            r.direction = scatter(r, hit, bounceSeed);
            color *= uMaterials[hit.materialId].albedo;
        } else { // hit sky
            vec3 unitDir = normalize(r.direction);
            float a = 0.5 * (unitDir.y + 1.0);

            vec3 backgroundColor = mix(uBackgroundColorBottom, uBackgroundColorTop, a);
            color *= backgroundColor;
            break;
        }
    }

    if (depth == uMaxRayDepth) { // never hit sky
        return vec3(0);
    }

    return color;
}

void main() {
    vec3 color = vec3(0);
    for (int s = 0; s < int(uNumSamples); s++) {
        float sampleIndex = float(s);
        vec2 temporalOffset = 4096.0 * hash22(
            uRandomSequence
                + vec2(0.754877666 * sampleIndex, 0.569840296 * sampleIndex)
        );
        vec2 sampleSeed = gl_FragCoord.xy + temporalOffset;

        vec2 pixelOffset = hash22(sampleSeed + vec2(5.3983, 7.1298)) - 0.5;
        vec2 uv = vNDC + pixelOffset / uResolution; // sample within pixel

        // get pixel sample position
        vec3 pixelSampleDir = normalize(
                uCamera.forward
                    + uv.x * uCamera.halfWidth * uCamera.right
                    + uv.y * uCamera.halfHeight * uCamera.up
            );
        vec3 pixelSample = uCamera.position + pixelSampleDir * uCamera.focusDistance;

        // sample defocus disk for Depth of Field

        vec3 defocusOffset = vec3(0);
        if (uEnableDoF) {
            float defocusRadius = uCamera.aperture / 2.;
            vec2 lensSample = hash22(sampleSeed + vec2(19.19, 73.73));
            vec2 defocusDiskSample = defocusRadius * sampleUnitDisk(lensSample);
            defocusOffset = defocusDiskSample.x * uCamera.right + defocusDiskSample.y * uCamera.up;
        }

        vec3 origin = uCamera.position + defocusOffset;
        vec3 direction = normalize(pixelSample - origin);

        Ray ray = Ray(origin, direction);
        color += rayColor(ray, uWorld, sampleSeed + vec2(101.13, 47.77));
    }

    color /= uNumSamples;

    if (uFrameCount > 1) {
        vec3 accumColor = texture2D(uAccumTexture, gl_FragCoord.xy / uResolution).rgb;
        color = mix(accumColor, color, 1.0 / float(uFrameCount));
    }

    gl_FragColor = vec4(color, 1.0);
}
