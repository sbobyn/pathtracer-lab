bool nearZero(vec3 value) {
    float threshold = 1e-8;
    return abs(value.x) < threshold && abs(value.y) < threshold && abs(value.z) < threshold;
}

vec3 scatterLambert(vec3 normal, vec2 seed) {
    vec3 direction = normal + randomOnUnitSphere(seed);
    if (nearZero(direction)) direction = normal;
    return normalize(direction);
}

vec3 scatterMetal(Ray incomingRay, vec3 normal, vec2 seed, float fuzz) {
    vec3 reflected = normalize(reflect(incomingRay.direction, normal));
    vec3 direction = reflected + fuzz * randomOnUnitSphere(seed);
    return dot(direction, normal) > 0.0 ? normalize(direction) : reflected;
}

float reflectance(float cosine, float ior) {
    float r0 = (1.0 - ior) / (1.0 + ior);
    r0 *= r0;
    return r0 + (1.0 - r0) * pow(1.0 - cosine, 5.0);
}

vec3 scatterDielectric(Ray incomingRay, Hit hit, vec3 normal, vec2 seed) {
    float materialIor = readMaterial(hit.materialId).ior;
    float ratio = hit.frontFace ? 1.0 / materialIor : materialIor;
    vec3 unitDirection = normalize(incomingRay.direction);
    float cosTheta = min(dot(-unitDirection, normal), 1.0);
    float sinTheta = sqrt(abs(1.0 - cosTheta * cosTheta) + 1e-4);
    bool cannotRefract = ratio * sinTheta > 1.0;
    bool useReflection = reflectance(cosTheta, ratio) > hash12(seed);
    return cannotRefract || useReflection
        ? reflect(unitDirection, normal)
        : refract(unitDirection, normal, ratio);
}

Surface evaluateSurface(Material material, Hit hit) {
    return Surface(
        material.baseColorFactor * sampleTexture(material.baseColorTextureId, hit),
        material.emissionFactor * sampleTexture(material.emissionTextureId, hit),
        hit.shadingNormal
    );
}

float bsdfPdf(Material material, Surface surface, vec3 outgoingDirection) {
    if (material.model != 0) return 0.0;
    return max(dot(surface.shadingNormal, outgoingDirection), 0.0) / PI;
}

vec3 evaluateBsdf(Material material, Surface surface, vec3 outgoingDirection) {
    if (material.model != 0) return vec3(0.0);
    if (dot(surface.shadingNormal, outgoingDirection) <= 0.0) return vec3(0.0);
    return surface.baseColor / PI;
}

BsdfSample sampleBsdf(Ray incomingRay, Hit hit, Material material, Surface surface, vec2 seed) {
    BsdfSample result;
    result.direction = vec3(0.0);
    result.weight = vec3(0.0);
    result.pdf = 0.0;
    result.delta = false;
    result.valid = false;

    if (material.model == 0) {
        result.direction = scatterLambert(surface.shadingNormal, seed);
        result.pdf = bsdfPdf(material, surface, result.direction);
        result.weight = surface.baseColor;
        result.valid = result.pdf > 0.0;
        return result;
    }
    if (material.model == 1) {
        result.direction = scatterMetal(incomingRay, surface.shadingNormal, seed, material.roughness);
        result.weight = surface.baseColor;
        result.delta = true;
        result.valid = true;
        return result;
    }
    if (material.model == 2) {
        result.direction = scatterDielectric(incomingRay, hit, surface.shadingNormal, seed);
        result.weight = surface.baseColor;
        result.delta = true;
        result.valid = true;
        return result;
    }
    return result;
}

bool materialScatters(Material material) {
    return material.model != 3;
}

vec3 emitted(Material material, Surface surface, Hit hit) {
    if (material.emissionStrength <= 0.0 || (!material.emissionTwoSided && !hit.frontFace)) return vec3(0.0);
    return material.emissionStrength * surface.emission;
}
