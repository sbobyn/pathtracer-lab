vec3 rayColor(Ray ray, World world, vec2 seed) {
    Hit hit;
    vec3 radiance = vec3(0.0);
    vec3 throughput = vec3(1.0);
    vec3 previousOrigin = ray.origin;
    float previousBsdfPdf = 0.0;
    bool previousWasLambert = false;
    for (int depth = 0; depth < uMaxRayDepth; depth++) {
        bool didHit = hitWorld(world, ray, Interval(1e-3, 1e4), hit);
        if (didHit) {
            Material material = readMaterial(hit.materialId);
            vec3 emission = emitted(material, hit);
            if (material.type == 3) {
                float emissionWeight = 1.0;
                if (previousWasLambert && uIntegratorMode == 1) {
                    emissionWeight = 0.0;
                } else if (previousWasLambert && uIntegratorMode == 2) {
                    float lightPdf = lightPdfForHit(previousOrigin, hit);
                    emissionWeight = powerHeuristic(previousBsdfPdf, lightPdf);
                }
                radiance += throughput * emissionWeight * emission;
            }
            if (!materialScatters(material)) break;

            vec2 bounceSeed = seed + vec2(
                17.0 * float(depth) + 11.0,
                59.0 * float(depth) + 23.0
            );
            if (material.type == 0 && uIntegratorMode != 0) {
                radiance += estimateDirectLambert(
                    world,
                    hit,
                    material,
                    throughput,
                    bounceSeed + vec2(131.0, 197.0)
                );
            }

            previousOrigin = hit.position;
            ray.origin = hit.position;
            ray.direction = scatter(ray, hit, bounceSeed);
            previousWasLambert = material.type == 0;
            previousBsdfPdf = previousWasLambert
                ? lambertPdf(hit.normal, ray.direction)
                : 0.0;
            throughput *= sampleTexture(material.textureId, hit);
        } else {
            vec3 unitDirection = normalize(ray.direction);
            bool sampleEnvironment = uEnvironmentEnabled && (
                (depth == 0 && uEnvironmentBackgroundVisible) ||
                (depth > 0 && uEnvironmentLightingEnabled)
            );
            if (sampleEnvironment) {
                float longitude = atan(unitDirection.z, unitDirection.x) + radians(uEnvironmentRotation);
                vec2 environmentUv = vec2(
                    fract(longitude / (2.0 * PI) + 0.5),
                    1.0 - acos(clamp(unitDirection.y, -1.0, 1.0)) / PI
                );
                radiance += throughput * texture(uEnvironmentMap, environmentUv).rgb * uEnvironmentIntensity;
            } else if (!uEnvironmentEnabled) {
                float blend = 0.5 * (unitDirection.y + 1.0);
                radiance += throughput * mix(uBackgroundColorBottom, uBackgroundColorTop, blend);
            }
            break;
        }
    }
    return radiance;
}
