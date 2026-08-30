Ray sampleCameraRay(vec2 uv, vec2 sampleSeed) {
    vec3 imageOffset =
        uv.x * uCamera.halfWidth * uCamera.right
        + uv.y * uCamera.halfHeight * uCamera.up;
    if (uCamera.orthographic) {
        return Ray(
            uCamera.position + imageOffset + uCamera.near * uCamera.forward,
            normalize(uCamera.forward)
        );
    }
    vec3 pixelDirection = normalize(
        uCamera.forward
            + imageOffset
    );
    vec3 pixelSample = uCamera.position + pixelDirection * uCamera.focusDistance;
    vec3 defocusOffset = vec3(0.0);
    if (uEnableDoF) {
        float radius = uCamera.aperture / 2.0;
        vec2 lensSample = hash22(sampleSeed + vec2(19.19, 73.73));
        vec2 diskSample = radius * sampleUnitDisk(lensSample);
        defocusOffset = diskSample.x * uCamera.right + diskSample.y * uCamera.up;
    }
    vec3 origin = uCamera.position + defocusOffset;
    return Ray(origin, normalize(pixelSample - origin));
}
