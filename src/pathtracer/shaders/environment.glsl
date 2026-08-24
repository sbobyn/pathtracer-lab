vec2 environmentUv(vec3 direction) {
    float longitude = atan(direction.z, direction.x) + radians(uEnvironmentRotation);
    return vec2(fract(longitude / (2.0 * PI) + 0.5),
        1.0 - acos(clamp(direction.y, -1.0, 1.0)) / PI);
}

vec3 environmentDirection(vec2 uv) {
    float theta = (1.0 - uv.y) * PI;
    float longitude = 2.0 * PI * (uv.x - 0.5) - radians(uEnvironmentRotation);
    float sinTheta = sin(theta);
    return vec3(cos(longitude) * sinTheta, cos(theta), sin(longitude) * sinTheta);
}

vec3 environmentRadiance(vec3 direction, float intensity) {
    return texture(uEnvironmentMap, environmentUv(normalize(direction))).rgb * intensity;
}

int findEnvironmentMarginal(float target) {
    int low = 0;
    int high = int(uEnvironmentDistributionSize.y) - 1;
    for (int i = 0; i < 9; i++) {
        if (low >= high) break;
        int middle = (low + high) / 2;
        if (target <= texelFetch(uEnvironmentMarginalCdf, ivec2(middle, 0), 0).r) high = middle;
        else low = middle + 1;
    }
    return low;
}

int findEnvironmentConditional(int row, float target) {
    int low = 0;
    int high = int(uEnvironmentDistributionSize.x) - 1;
    for (int i = 0; i < 9; i++) {
        if (low >= high) break;
        int middle = (low + high) / 2;
        if (target <= texelFetch(uEnvironmentConditionalCdf, ivec2(middle, row), 0).r) high = middle;
        else low = middle + 1;
    }
    return low;
}

float environmentPdf(vec3 direction) {
    vec2 uv = environmentUv(normalize(direction));
    ivec2 cell = ivec2(min(floor(uv * uEnvironmentDistributionSize), uEnvironmentDistributionSize - 1.0));
    float conditionalProbability = texelFetch(uEnvironmentConditionalCdf, cell, 0).g;
    float rowProbability = texelFetch(uEnvironmentMarginalCdf, ivec2(cell.y, 0), 0).g;
    float theta0 = PI * float(cell.y) / uEnvironmentDistributionSize.y;
    float theta1 = PI * float(cell.y + 1) / uEnvironmentDistributionSize.y;
    float solidAngle = (2.0 * PI / uEnvironmentDistributionSize.x) * (cos(theta0) - cos(theta1));
    return conditionalProbability * rowProbability / max(solidAngle, 1e-12);
}

vec3 sampleEnvironmentDirection(vec2 seed, out float pdf) {
    int row = findEnvironmentMarginal(seed.y);
    int column = findEnvironmentConditional(row, seed.x);
    vec2 jitter = hash22(seed + vec2(43.17, 91.73));
    float u = (float(column) + jitter.x) / uEnvironmentDistributionSize.x;
    // Distribution rows use texture-v order. Equirectangular theta runs in the
    // opposite direction (v=0 is theta=PI), so invert the row boundaries here
    // without changing the selected row.
    float theta0 = PI * (1.0 - float(row) / uEnvironmentDistributionSize.y);
    float theta1 = PI * (1.0 - float(row + 1) / uEnvironmentDistributionSize.y);
    float cosTheta = mix(cos(theta0), cos(theta1), jitter.y);
    float v = 1.0 - acos(clamp(cosTheta, -1.0, 1.0)) / PI;
    vec3 direction = environmentDirection(vec2(u, v));
    pdf = environmentPdf(direction);
    return direction;
}
