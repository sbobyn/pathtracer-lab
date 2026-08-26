vec3 rayColor(Ray ray, World world, vec2 seed) {
    Hit hit;
    vec3 radiance = vec3(0.0);
    vec3 throughput = vec3(1.0);
    vec3 previousOrigin = ray.origin;
    float previousBsdfPdf = 0.0;
    bool previousWasNonDelta = false;
    for (int depth = 0; depth < uMaxRayDepth; depth++) {
        bool didHit = hitWorld(world, ray, Interval(1e-3, 1e4), hit);
        if (didHit) {
            Material material = readMaterial(hit.materialId);
            Surface surface = evaluateSurface(material, hit);
            vec3 emission = emitted(material, surface, hit);
            if (material.emissionStrength > 0.0) {
                float emissionWeight = 1.0;
                if (previousWasNonDelta && uIntegratorMode == 1) {
                    emissionWeight = 0.0;
                } else if (previousWasNonDelta && uIntegratorMode == 2) {
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
            if (materialSupportsDirectLighting(material) && uIntegratorMode != 0) {
                radiance += estimateDirectBsdf(
                    world,
                    hit,
                    material,
                    surface,
                    normalize(-ray.direction),
                    throughput,
                    bounceSeed + vec2(131.0, 197.0)
                );
            }

            previousOrigin = hit.position;
            BsdfSample bsdfSample = sampleBsdf(ray, hit, material, surface, bounceSeed);
            if (!bsdfSample.valid) break;
            ray.origin = hit.position;
            ray.direction = bsdfSample.direction;
            previousWasNonDelta = !bsdfSample.delta;
            previousBsdfPdf = bsdfSample.pdf;
            throughput *= bsdfSample.weight;
        } else {
            vec3 unitDirection = normalize(ray.direction);
            bool sampleEnvironment = uEnvironmentEnabled && (
                (depth == 0 && uEnvironmentBackgroundVisible) ||
                (depth > 0 && uEnvironmentLightingEnabled)
            );
            if (sampleEnvironment) {
                float environmentWeight = 1.0;
                if (depth > 0 && previousWasNonDelta && uIntegratorMode == 1) {
                    environmentWeight = 0.0;
                } else if (depth > 0 && previousWasNonDelta && uIntegratorMode == 2) {
                    environmentWeight = powerHeuristic(
                        previousBsdfPdf,
                        environmentLightPdf(unitDirection)
                    );
                }
                float environmentIntensity = depth == 0
                    ? uEnvironmentIntensity
                    : uEnvironmentLightingIntensity;
                radiance += throughput * environmentWeight * environmentRadiance(
                    unitDirection,
                    environmentIntensity
                );
            } else if (!uEnvironmentEnabled) {
                float blend = 0.5 * (unitDirection.y + 1.0);
                radiance += throughput * mix(uBackgroundColorBottom, uBackgroundColorTop, blend);
            }
            break;
        }
    }
    return radiance;
}
