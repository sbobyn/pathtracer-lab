struct LightSample {
    vec3 position;
    vec3 normal;
    vec3 direction;
    vec2 uv;
    float distance;
    float pdf;
    int materialId;
    bool valid;
};

float powerHeuristic(float pdfA, float pdfB) {
    float a2 = pdfA * pdfA;
    float b2 = pdfB * pdfB;
    return a2 / max(a2 + b2, 1e-12);
}

float lambertPdf(vec3 normal, vec3 direction) {
    return max(dot(normal, direction), 0.0) / PI;
}

LightSample sampleLight(World world, vec3 origin, vec2 seed) {
    LightSample lightSample;
    lightSample.valid = false;
    lightSample.pdf = 0.0;
    if (uLightCount <= 0) return lightSample;

    int lightIndex = int(floor(hash12(seed) * float(uLightCount)));
    if (lightIndex >= uLightCount) lightIndex = uLightCount - 1;
    Light light = uLights[lightIndex];
    vec2 surfaceSeed = hash22(seed + vec2(19.19, 73.73));

    if (light.primitiveType == 0) {
        Sphere sphere = world.spheres[light.primitiveIndex];
        lightSample.normal = randomOnUnitSphere(surfaceSeed);
        lightSample.position = sphere.position + sphere.radius * lightSample.normal;
        lightSample.uv = sphere.uvMapping == 1
            ? boxUv(lightSample.normal)
            : sphereUv(lightSample.normal);
    } else {
        Quad quad = world.quads[light.primitiveIndex];
        lightSample.position = quad.q + surfaceSeed.x * quad.u + surfaceSeed.y * quad.v;
        lightSample.normal = quad.normal;
        lightSample.uv = surfaceSeed;
    }

    vec3 toLight = lightSample.position - origin;
    float distanceSquared = dot(toLight, toLight);
    if (distanceSquared <= 1e-10) return lightSample;
    lightSample.distance = sqrt(distanceSquared);
    lightSample.direction = toLight / lightSample.distance;
    float lightCosine = dot(lightSample.normal, -lightSample.direction);
    lightCosine = light.emissionTwoSided ? abs(lightCosine) : lightCosine;
    if (lightCosine <= 1e-6) return lightSample;

    lightSample.pdf = distanceSquared /
        (lightCosine * light.area * float(uLightCount));
    lightSample.materialId = light.materialId;
    lightSample.valid = lightSample.pdf > 0.0;
    return lightSample;
}

float lightPdfForHit(vec3 origin, Hit hit) {
    if (uLightCount <= 0) return 0.0;
    for (int i = 0; i < MAX_LIGHTS; i++) {
        if (i >= uLightCount) break;
        Light light = uLights[i];
        if (
            light.primitiveType != hit.primitiveType ||
            light.primitiveIndex != hit.primitiveId
        ) continue;

        vec3 outwardNormal = light.primitiveType == 0
            ? normalize(hit.position - uWorld.spheres[light.primitiveIndex].position)
            : uWorld.quads[light.primitiveIndex].normal;
        vec3 fromOrigin = hit.position - origin;
        float distanceSquared = dot(fromOrigin, fromOrigin);
        vec3 direction = normalize(fromOrigin);
        float lightCosine = dot(outwardNormal, -direction);
        lightCosine = light.emissionTwoSided ? abs(lightCosine) : lightCosine;
        if (lightCosine <= 1e-6) return 0.0;
        return distanceSquared /
            (lightCosine * light.area * float(uLightCount));
    }
    return 0.0;
}

vec3 estimateDirectLambert(World world, Hit hit, Material material, vec3 throughput, vec2 seed) {
    LightSample light = sampleLight(world, hit.position, seed);
    if (!light.valid) return vec3(0.0);

    float surfaceCosine = max(dot(hit.normal, light.direction), 0.0);
    if (surfaceCosine <= 0.0) return vec3(0.0);
    Ray shadowRay = Ray(hit.position + 1e-3 * hit.normal, light.direction);
    Hit blocker;
    if (hitWorld(world, shadowRay, Interval(1e-3, light.distance - 2e-3), blocker)) {
        return vec3(0.0);
    }

    Material lightMaterial = uMaterials[light.materialId];
    Hit lightHit;
    lightHit.position = light.position;
    lightHit.normal = light.normal;
    lightHit.uv = light.uv;
    lightHit.frontFace = true;
    lightHit.materialId = light.materialId;
    vec3 lightRadiance = lightMaterial.emissionStrength *
        sampleTexture(lightMaterial.textureId, lightHit);
    vec3 albedo = sampleTexture(material.textureId, hit);
    float weight = uIntegratorMode == 2
        ? powerHeuristic(light.pdf, lambertPdf(hit.normal, light.direction))
        : 1.0;
    return throughput * lightRadiance * (albedo / PI) *
        surfaceCosine * weight / light.pdf;
}
