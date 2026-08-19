vec3 accumulateSample(vec3 currentColor) {
    if (uFrameCount <= 1) return currentColor;
    vec3 accumulatedColor = texture2D(
        uAccumTexture,
        gl_FragCoord.xy / uResolution
    ).rgb;
    return mix(accumulatedColor, currentColor, 1.0 / float(uFrameCount));
}
