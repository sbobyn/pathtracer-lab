vec3 rayColor(Ray ray, World world, vec2 seed) {
    Hit hit;
    vec3 radiance = vec3(0.0);
    vec3 throughput = vec3(1.0);
    for (int depth = 0; depth < uMaxRayDepth; depth++) {
        bool didHit = hitWorld(world, ray, Interval(1e-3, 1e4), hit);
        if (didHit) {
            Material material = uMaterials[hit.materialId];
            radiance += throughput * emitted(material, hit);
            if (!materialScatters(material)) break;

            ray.origin = hit.position;
            vec2 bounceSeed = seed + vec2(
                17.0 * float(depth) + 11.0,
                59.0 * float(depth) + 23.0
            );
            ray.direction = scatter(ray, hit, bounceSeed);
            throughput *= sampleTexture(material.textureId, hit);
        } else {
            vec3 unitDirection = normalize(ray.direction);
            float blend = 0.5 * (unitDirection.y + 1.0);
            radiance += throughput * mix(uBackgroundColorBottom, uBackgroundColorTop, blend);
            break;
        }
    }
    return radiance;
}
