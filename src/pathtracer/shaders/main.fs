#ifndef MAX_SPHERES
#define MAX_SPHERES 1
#endif

precision highp float;
#define PI 3.141592653

#include types.glsl

varying vec2 vNDC;
uniform vec2 uResolution;
uniform vec3 uBackgroundColorTop;
uniform vec3 uBackgroundColorBottom;
uniform int uMaxRayDepth;
uniform float uNumSamples;
uniform bool uEnableDoF;
uniform sampler2D uAccumTexture;
uniform int uFrameCount;
uniform vec2 uRandomSequence;
uniform Camera uCamera;
uniform World uWorld;
uniform int uSphereCount;
uniform Material uMaterials[MAX_SPHERES];
uniform Texture uTextures[MAX_SPHERES];
uniform sampler2D uImageTexture0;
uniform sampler2D uImageTexture1;
uniform sampler2D uImageTexture2;
uniform sampler2D uImageTexture3;

#include geometry.glsl
#include random.glsl
#include textures.glsl
#include materials.glsl
#include camera.glsl
#include integrator.glsl
#include accumulation.glsl

void main() {
    vec3 color = vec3(0.0);
    for (int s = 0; s < int(uNumSamples); s++) {
        float sampleIndex = float(s);
        vec2 temporalOffset = 4096.0 * hash22(
            uRandomSequence + vec2(
                0.754877666 * sampleIndex,
                0.569840296 * sampleIndex
            )
        );
        vec2 sampleSeed = gl_FragCoord.xy + temporalOffset;
        vec2 pixelOffset = hash22(sampleSeed + vec2(5.3983, 7.1298)) - 0.5;
        vec2 uv = vNDC + pixelOffset / uResolution;
        Ray ray = sampleCameraRay(uv, sampleSeed);
        color += rayColor(ray, uWorld, sampleSeed + vec2(101.13, 47.77));
    }
    color /= uNumSamples;
    gl_FragColor = vec4(accumulateSample(color), 1.0);
}
