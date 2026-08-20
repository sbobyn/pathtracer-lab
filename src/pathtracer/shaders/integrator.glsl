vec3 rayColor(Ray ray, World world, vec2 seed) {
    Hit hit;
    vec3 color = vec3(1.0);
    int depth;
    for (depth = 0; depth < uMaxRayDepth; depth++) {
        bool didHit = hitWorld(world, ray, Interval(1e-3, 1e4), hit);
        if (didHit) {
            ray.origin = hit.position;
            vec2 bounceSeed = seed + vec2(
                17.0 * float(depth) + 11.0,
                59.0 * float(depth) + 23.0
            );
            ray.direction = scatter(ray, hit, bounceSeed);
            color *= sampleTexture(uMaterials[hit.materialId].textureId, hit);
        } else {
            vec3 unitDirection = normalize(ray.direction);
            float blend = 0.5 * (unitDirection.y + 1.0);
            color *= mix(uBackgroundColorBottom, uBackgroundColorTop, blend);
            break;
        }
    }
    return depth == uMaxRayDepth ? vec3(0.0) : color;
}
