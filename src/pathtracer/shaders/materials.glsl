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
    vec3 baseColorTexture = (material.textureEnableMask & 1) != 0
        ? sampleTexture(material.baseColorTextureId, hit) : vec3(1.0);
    vec3 metallicRoughness = (material.textureEnableMask & 2) != 0
        ? sampleTexture(material.metallicRoughnessTextureId, hit) : vec3(1.0);
    vec3 emissionTexture = (material.textureEnableMask & 4) != 0
        ? sampleTexture(material.emissionTextureId, hit) : vec3(0.0);
    return Surface(
        material.baseColorFactor * baseColorTexture,
        material.emissionFactor * emissionTexture,
        hit.shadingNormal,
        clamp(material.roughness * metallicRoughness.g, 0.045, 1.0),
        clamp(material.metallic * metallicRoughness.b, 0.0, 1.0)
    );
}

float dielectricF0(float ior) {
    float ratio = (max(ior, 1.0001) - 1.0) / (max(ior, 1.0001) + 1.0);
    return ratio * ratio;
}

vec3 fresnelSchlick(vec3 f0, float cosine) {
    return mix(f0, vec3(1.0), pow(1.0 - clamp(cosine, 0.0, 1.0), 5.0));
}

float ggxDistribution(float noH, float alpha) {
    float alphaSquared = alpha * alpha;
    float denominator = noH * noH * (alphaSquared - 1.0) + 1.0;
    return alphaSquared / max(PI * denominator * denominator, 1e-12);
}

float smithG1(float noX, float alpha) {
    float alphaSquared = alpha * alpha;
    return 2.0 * noX / max(
        noX + sqrt(alphaSquared + (1.0 - alphaSquared) * noX * noX),
        1e-8
    );
}

float principledSpecularProbability(Material material, Surface surface) {
    vec3 f0 = mix(vec3(dielectricF0(material.ior)), surface.baseColor, surface.metallic);
    float luminance = dot(f0, vec3(0.2126, 0.7152, 0.0722));
    return clamp(luminance, 0.1, 0.9);
}

float bsdfPdf(Material material, Surface surface, vec3 viewDirection, vec3 outgoingDirection) {
    float noL = max(dot(surface.shadingNormal, outgoingDirection), 0.0);
    if (material.model == 0) return noL / PI;
    if (material.model != 4 || noL <= 0.0) return 0.0;
    float noV = max(dot(surface.shadingNormal, viewDirection), 0.0);
    vec3 halfVector = viewDirection + outgoingDirection;
    if (noV <= 0.0 || dot(halfVector, halfVector) <= 1e-12) return 0.0;
    halfVector = normalize(halfVector);
    float noH = max(dot(surface.shadingNormal, halfVector), 0.0);
    float voH = max(dot(viewDirection, halfVector), 0.0);
    if (noH <= 0.0 || voH <= 0.0) return 0.0;
    float alpha = surface.roughness * surface.roughness;
    float diffusePdf = noL / PI;
    float specularPdf = ggxDistribution(noH, alpha) * noH / max(4.0 * voH, 1e-8);
    return mix(diffusePdf, specularPdf, principledSpecularProbability(material, surface));
}

vec3 evaluateBsdf(Material material, Surface surface, vec3 viewDirection, vec3 outgoingDirection) {
    float noL = max(dot(surface.shadingNormal, outgoingDirection), 0.0);
    if (material.model == 0) return noL > 0.0 ? surface.baseColor / PI : vec3(0.0);
    if (material.model != 4 || noL <= 0.0) return vec3(0.0);
    float noV = max(dot(surface.shadingNormal, viewDirection), 0.0);
    vec3 halfVector = viewDirection + outgoingDirection;
    if (noV <= 0.0 || dot(halfVector, halfVector) <= 1e-12) return vec3(0.0);
    halfVector = normalize(halfVector);
    float noH = max(dot(surface.shadingNormal, halfVector), 0.0);
    float voH = max(dot(viewDirection, halfVector), 0.0);
    float alpha = surface.roughness * surface.roughness;
    vec3 f0 = mix(vec3(dielectricF0(material.ior)), surface.baseColor, surface.metallic);
    vec3 fresnel = fresnelSchlick(f0, voH);
    float distribution = ggxDistribution(noH, alpha);
    float masking = smithG1(noV, alpha) * smithG1(noL, alpha);
    vec3 specular = fresnel * distribution * masking / max(4.0 * noV * noL, 1e-8);
    vec3 diffuse = surface.baseColor * (vec3(1.0) - fresnel) * (1.0 - surface.metallic) / PI;
    return diffuse + specular;
}

vec3 sampleGgxReflection(vec3 viewDirection, vec3 normal, float alpha, vec2 seed) {
    float u = min(hash12(seed), 0.999999);
    float phi = 2.0 * PI * hash12(seed + vec2(37.1, 91.7));
    float alphaSquared = alpha * alpha;
    float cosTheta = sqrt((1.0 - u) / max(1.0 + (alphaSquared - 1.0) * u, 1e-8));
    float sinTheta = sqrt(max(0.0, 1.0 - cosTheta * cosTheta));
    vec3 helper = abs(normal.z) < 0.999 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
    vec3 tangent = normalize(cross(helper, normal));
    vec3 bitangent = cross(normal, tangent);
    vec3 halfVector = normalize(
        tangent * cos(phi) * sinTheta + bitangent * sin(phi) * sinTheta + normal * cosTheta
    );
    return normalize(reflect(-viewDirection, halfVector));
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
        result.pdf = bsdfPdf(material, surface, normalize(-incomingRay.direction), result.direction);
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
    if (material.model == 4) {
        vec3 viewDirection = normalize(-incomingRay.direction);
        float chooseSpecular = principledSpecularProbability(material, surface);
        result.direction = hash12(seed + vec2(13.7, 29.3)) < chooseSpecular
            ? sampleGgxReflection(viewDirection, surface.shadingNormal, surface.roughness * surface.roughness, seed)
            : scatterLambert(surface.shadingNormal, seed);
        result.pdf = bsdfPdf(material, surface, viewDirection, result.direction);
        float cosine = max(dot(surface.shadingNormal, result.direction), 0.0);
        result.weight = evaluateBsdf(material, surface, viewDirection, result.direction) * cosine / max(result.pdf, 1e-8);
        result.valid = cosine > 0.0 && result.pdf > 0.0;
        return result;
    }
    return result;
}

bool materialSupportsDirectLighting(Material material) {
    return material.model == 0 || material.model == 4;
}

bool materialScatters(Material material) {
    return material.model != 3;
}

vec3 emitted(Material material, Surface surface, Hit hit) {
    if (material.emissionStrength <= 0.0 || (!material.emissionTwoSided && !hit.frontFace)) return vec3(0.0);
    return material.emissionStrength * surface.emission;
}
