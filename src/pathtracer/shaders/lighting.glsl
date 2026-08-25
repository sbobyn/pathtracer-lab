struct LightSample {
    vec3 position;
    vec3 normal;
    vec3 direction;
    vec2 uv;
    float distance;
    float pdf;
    int materialId;
    vec3 radiance;
    bool environment;
    bool delta;
    bool valid;
};

int lightStrategyCount() {
    return uLightCount + ((uEnvironmentEnabled && uEnvironmentLightingEnabled) ? 1 : 0);
}

float powerHeuristic(float pdfA, float pdfB) {
    float a2 = pdfA * pdfA;
    float b2 = pdfB * pdfB;
    return a2 / max(a2 + b2, 1e-12);
}

vec3 sampleCone(vec3 axis, float cosThetaMax, vec2 seed) {
    float cosTheta = mix(cosThetaMax, 1.0, seed.x);
    float sinTheta = sqrt(max(0.0, 1.0 - cosTheta * cosTheta));
    float phi = 2.0 * PI * seed.y;
    vec3 helper = abs(axis.z) < 0.999
        ? vec3(0.0, 0.0, 1.0)
        : vec3(1.0, 0.0, 0.0);
    vec3 tangent = normalize(cross(helper, axis));
    vec3 bitangent = cross(axis, tangent);
    return normalize(
        tangent * cos(phi) * sinTheta +
        bitangent * sin(phi) * sinTheta +
        axis * cosTheta
    );
}

LightSample sampleLight(World world, vec3 origin, vec2 seed) {
    LightSample lightSample;
    lightSample.valid = false;
    lightSample.pdf = 0.0;
    lightSample.environment = false;
    lightSample.delta = false;
    int strategyCount = lightStrategyCount();
    if (strategyCount <= 0) return lightSample;

    int lightIndex = int(floor(hash12(seed) * float(strategyCount)));
    if (lightIndex >= strategyCount) lightIndex = strategyCount - 1;
    vec2 surfaceSeed = hash22(seed + vec2(19.19, 73.73));
    if (lightIndex == uLightCount) {
        float directionPdf = 0.0;
        lightSample.direction = sampleEnvironmentDirection(surfaceSeed, directionPdf);
        lightSample.distance = 1e4;
        lightSample.position = origin + lightSample.direction * lightSample.distance;
        lightSample.normal = -lightSample.direction;
        lightSample.uv = environmentUv(lightSample.direction);
        lightSample.pdf = directionPdf / float(strategyCount);
        lightSample.radiance = environmentRadiance(
            lightSample.direction,
            uEnvironmentLightingIntensity
        );
        lightSample.environment = true;
        lightSample.valid = lightSample.pdf > 0.0;
        return lightSample;
    }
    Light light = uLights[lightIndex];

    if (light.kind == 3) {
        vec3 incomingAxis = normalize(-light.direction);
        float angularRadius = 0.5 * radians(light.angularDiameter);
        if (angularRadius > 1e-6) {
            float cosThetaMax = cos(angularRadius);
            float solidAngle = 2.0 * PI * (1.0 - cosThetaMax);
            lightSample.direction = sampleCone(incomingAxis, cosThetaMax, surfaceSeed);
            lightSample.pdf = 1.0 / (float(strategyCount) * solidAngle);
            lightSample.radiance = light.color * light.intensity / solidAngle;
        } else {
            lightSample.direction = incomingAxis;
            lightSample.pdf = 1.0 / float(strategyCount);
            lightSample.radiance = light.color * light.intensity;
        }
        lightSample.distance = 1e4;
        lightSample.position = origin + lightSample.direction * lightSample.distance;
        lightSample.normal = -lightSample.direction;
        lightSample.uv = vec2(0.0);
        lightSample.delta = true;
        lightSample.valid = true;
        return lightSample;
    }

    if (light.kind == 2 || light.kind == 4) {
        vec3 toLight = light.position - origin;
        float distanceSquared = dot(toLight, toLight);
        if (distanceSquared <= 1e-10) return lightSample;
        lightSample.distance = sqrt(distanceSquared);
        lightSample.direction = toLight / lightSample.distance;
        lightSample.position = light.position;
        lightSample.normal = -lightSample.direction;
        lightSample.uv = vec2(0.0);
        lightSample.pdf = 1.0 / float(strategyCount);
        float falloff = 1.0;
        if (light.kind == 4) {
            float coneCosine = dot(normalize(light.direction), -lightSample.direction);
            falloff = smoothstep(light.outerConeCos, light.innerConeCos, coneCosine);
        }
        lightSample.radiance = light.color * light.intensity * falloff / distanceSquared;
        lightSample.delta = true;
        lightSample.valid = falloff > 0.0;
        return lightSample;
    }

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
        (lightCosine * light.area * float(strategyCount));
    lightSample.materialId = light.materialId;
    lightSample.radiance = vec3(0.0);
    lightSample.valid = lightSample.pdf > 0.0;
    return lightSample;
}

float lightPdfForHit(vec3 origin, Hit hit) {
    if (uLightCount <= 0) return 0.0;
    for (int i = 0; i < MAX_LIGHTS; i++) {
        if (i >= uLightCount) break;
        Light light = uLights[i];
        if (light.kind >= 2) continue;
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
            (lightCosine * light.area * float(lightStrategyCount()));
    }
    return 0.0;
}

float environmentLightPdf(vec3 direction) {
    int strategyCount = lightStrategyCount();
    if (!uEnvironmentEnabled || !uEnvironmentLightingEnabled || strategyCount <= 0) return 0.0;
    return environmentPdf(direction) / float(strategyCount);
}

vec3 estimateDirectBsdf(World world, Hit hit, Material material, vec3 throughput, vec2 seed) {
    LightSample light = sampleLight(world, hit.position, seed);
    if (!light.valid) return vec3(0.0);

    float surfaceCosine = max(dot(hit.normal, light.direction), 0.0);
    if (surfaceCosine <= 0.0) return vec3(0.0);
    Ray shadowRay = Ray(hit.position + 1e-3 * hit.normal, light.direction);
    Hit blocker;
    if (hitWorld(world, shadowRay, Interval(1e-3, light.distance - 2e-3), blocker)) {
        return vec3(0.0);
    }

    vec3 lightRadiance = light.radiance;
    if (!light.delta && !light.environment) {
        Material lightMaterial = readMaterial(light.materialId);
        Hit lightHit;
        lightHit.position = light.position;
        lightHit.normal = light.normal;
        lightHit.uv = light.uv;
        lightHit.frontFace = true;
        lightHit.materialId = light.materialId;
        lightRadiance = lightMaterial.emissionStrength *
            sampleTexture(lightMaterial.emissionTextureId, lightHit);
    }
    vec3 bsdf = evaluateBsdf(material, hit, light.direction);
    float weight = uIntegratorMode == 2 && !light.delta
        ? powerHeuristic(light.pdf, bsdfPdf(material, hit, light.direction))
        : 1.0;
    return throughput * lightRadiance * bsdf *
        surfaceCosine * weight / light.pdf;
}
