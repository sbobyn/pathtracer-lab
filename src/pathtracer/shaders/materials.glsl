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
    float materialIor = uMaterials[hit.materialId].ior;
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

vec3 scatter(Ray incomingRay, Hit hit, vec2 seed) {
    Material material = uMaterials[hit.materialId];
    if (material.type == 0) return scatterLambert(hit, seed);
    if (material.type == 1) return scatterMetal(incomingRay, hit, seed, material.fuzz);
    if (material.type == 2) return scatterDielectric(incomingRay, hit, seed);
    return vec3(0.0);
}

bool materialScatters(Material material) {
    return material.type != 3;
}

vec3 emitted(Material material, Hit hit) {
    if (material.type != 3 || (!material.emissionTwoSided && !hit.frontFace)) return vec3(0.0);
    return material.emissionStrength * sampleTexture(material.textureId, hit);
}
