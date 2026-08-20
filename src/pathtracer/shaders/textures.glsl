vec3 perlinGradient(vec3 cell) {
    vec3 value = fract(sin(vec3(
        dot(cell, vec3(127.1, 311.7, 74.7)),
        dot(cell, vec3(269.5, 183.3, 246.1)),
        dot(cell, vec3(113.5, 271.9, 124.6))
    )) * 43758.5453) * 2.0 - 1.0;
    return normalize(value + vec3(1e-4));
}

float perlinNoise(vec3 position) {
    vec3 cell = floor(position);
    vec3 local = fract(position);
    vec3 fade = local * local * local * (local * (local * 6.0 - 15.0) + 10.0);
    float n000 = dot(perlinGradient(cell + vec3(0, 0, 0)), local - vec3(0, 0, 0));
    float n100 = dot(perlinGradient(cell + vec3(1, 0, 0)), local - vec3(1, 0, 0));
    float n010 = dot(perlinGradient(cell + vec3(0, 1, 0)), local - vec3(0, 1, 0));
    float n110 = dot(perlinGradient(cell + vec3(1, 1, 0)), local - vec3(1, 1, 0));
    float n001 = dot(perlinGradient(cell + vec3(0, 0, 1)), local - vec3(0, 0, 1));
    float n101 = dot(perlinGradient(cell + vec3(1, 0, 1)), local - vec3(1, 0, 1));
    float n011 = dot(perlinGradient(cell + vec3(0, 1, 1)), local - vec3(0, 1, 1));
    float n111 = dot(perlinGradient(cell + vec3(1, 1, 1)), local - vec3(1, 1, 1));
    return mix(mix(mix(n000, n100, fade.x), mix(n010, n110, fade.x), fade.y),
               mix(mix(n001, n101, fade.x), mix(n011, n111, fade.x), fade.y), fade.z);
}

float perlinTurbulence(vec3 position) {
    float sum = 0.0;
    float weight = 1.0;
    for (int octave = 0; octave < 7; octave++) {
        sum += weight * perlinNoise(position);
        position *= 2.0;
        weight *= 0.5;
    }
    return abs(sum);
}

vec3 sampleTexture(int textureId, Hit hit) {
    Texture textureValue = uTextures[textureId];
    if (textureValue.type == 0) return textureValue.colorA;
    if (textureValue.type == 1) {
        vec2 cell = floor(hit.uv * textureValue.scale);
        float parity = mod(cell.x + cell.y, 2.0);
        return mix(textureValue.colorA, textureValue.colorB, parity);
    }
    if (textureValue.type == 2) {
        if (textureValue.imageId == 0) return texture2D(uImageTexture0, hit.uv).rgb;
        if (textureValue.imageId == 1) return texture2D(uImageTexture1, hit.uv).rgb;
        if (textureValue.imageId == 2) return texture2D(uImageTexture2, hit.uv).rgb;
        if (textureValue.imageId == 3) return texture2D(uImageTexture3, hit.uv).rgb;
    }
    if (textureValue.type == 3) {
        float marble = 0.5 * (1.0 + sin(
            textureValue.scale * hit.position.z +
            textureValue.turbulence * perlinTurbulence(hit.position)
        ));
        return mix(textureValue.colorA, textureValue.colorB, marble);
    }
    return vec3(1.0, 0.0, 1.0);
}
