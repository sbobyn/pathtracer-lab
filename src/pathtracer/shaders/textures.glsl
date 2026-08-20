vec3 sampleTexture(int textureId, Hit hit) {
    Texture textureValue = uTextures[textureId];
    if (textureValue.type == 0) return textureValue.colorA;
    if (textureValue.type == 1) {
        vec2 cell = floor(hit.uv * textureValue.scale);
        float parity = mod(cell.x + cell.y, 2.0);
        return mix(textureValue.colorA, textureValue.colorB, parity);
    }
    return vec3(1.0, 0.0, 1.0);
}
