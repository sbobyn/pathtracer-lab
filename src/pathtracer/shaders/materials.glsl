bool nearZero(vec3 value) {
    float threshold = 1e-8;
    return abs(value.x) < threshold && abs(value.y) < threshold && abs(value.z) < threshold;
}

vec3 scatterLambert(Hit hit, vec2 seed) {
    vec3 direction = hit.normal + randomOnUnitSphere(seed);
    if (nearZero(direction)) direction = hit.normal;
    return normalize(direction);
}

vec3 scatterMetal(Ray incomingRay, Hit hit, vec2 seed, float fuzz) {
    vec3 reflected = normalize(reflect(incomingRay.direction, hit.normal));
    vec3 direction = reflected + fuzz * randomOnUnitSphere(seed);
    return dot(direction, hit.normal) > 0.0 ? normalize(direction) : reflected;
}

float reflectance(float cosine, float ior) {
    float r0 = (1.0 - ior) / (1.0 + ior);
    r0 *= r0;
    return r0 + (1.0 - r0) * pow(1.0 - cosine, 5.0);
}

vec3 scatterDielectric(Ray incomingRay, Hit hit, vec2 seed) {
    float materialIor = readMaterial(hit.materialId).ior;
    float ratio = hit.frontFace ? 1.0 / materialIor : materialIor;
    vec3 unitDirection = normalize(incomingRay.direction);
    float cosTheta = min(dot(-unitDirection, hit.normal), 1.0);
    float sinTheta = sqrt(abs(1.0 - cosTheta * cosTheta) + 1e-4);
    bool cannotRefract = ratio * sinTheta > 1.0;
    bool useReflection = reflectance(cosTheta, ratio) > hash12(seed);
    return cannotRefract || useReflection
        ? reflect(unitDirection, hit.normal)
        : refract(unitDirection, hit.normal, ratio);
}

float bsdfPdf(Material material, Hit hit, vec3 outgoingDirection) {
    if (material.model != 0) return 0.0;
    return max(dot(hit.normal, outgoingDirection), 0.0) / PI;
}

vec3 evaluateBsdf(Material material, Hit hit, vec3 outgoingDirection) {
    if (material.model != 0) return vec3(0.0);
    if (dot(hit.normal, outgoingDirection) <= 0.0) return vec3(0.0);
    return sampleTexture(material.baseColorTextureId, hit) / PI;
}

BsdfSample sampleBsdf(Ray incomingRay, Hit hit, Material material, vec2 seed) {
    BsdfSample result;
    result.direction = vec3(0.0);
    result.weight = vec3(0.0);
    result.pdf = 0.0;
    result.delta = false;
    result.valid = false;

    if (material.model == 0) {
        result.direction = scatterLambert(hit, seed);
        result.pdf = bsdfPdf(material, hit, result.direction);
        result.weight = sampleTexture(material.baseColorTextureId, hit);
        result.valid = result.pdf > 0.0;
        return result;
    }
    if (material.model == 1) {
        result.direction = scatterMetal(incomingRay, hit, seed, material.roughness);
        result.weight = sampleTexture(material.baseColorTextureId, hit);
        result.delta = true;
        result.valid = true;
        return result;
    }
    if (material.model == 2) {
        result.direction = scatterDielectric(incomingRay, hit, seed);
        result.weight = sampleTexture(material.baseColorTextureId, hit);
        result.delta = true;
        result.valid = true;
        return result;
    }
    return result;
}

bool materialScatters(Material material) {
    return material.model != 3;
}

vec3 emitted(Material material, Hit hit) {
    if (material.emissionStrength <= 0.0 || (!material.emissionTwoSided && !hit.frontFace)) return vec3(0.0);
    return material.emissionStrength * sampleTexture(material.emissionTextureId, hit);
}
