#ifndef MAX_QUADS
#define MAX_QUADS 1
#endif
#ifndef MAX_LIGHTS
#define MAX_LIGHTS 1
#endif

precision highp float;
#define PI 3.141592653

#include types.glsl

in vec2 vNDC;
out vec4 fragmentColor;
uniform vec2 uResolution;
uniform vec3 uBackgroundColorTop;
uniform vec3 uBackgroundColorBottom;
uniform sampler2D uEnvironmentMap;
uniform sampler2D uEnvironmentConditionalCdf;
uniform sampler2D uEnvironmentMarginalCdf;
uniform vec2 uEnvironmentDistributionSize;
uniform bool uEnvironmentEnabled;
uniform bool uEnvironmentBackgroundVisible;
uniform bool uEnvironmentLightingEnabled;
uniform float uEnvironmentRotation;
uniform float uEnvironmentIntensity;
uniform float uEnvironmentLightingIntensity;
uniform int uMaxRayDepth;
uniform float uNumSamples;
uniform bool uEnableDoF;
uniform sampler2D uAccumTexture;
uniform int uFrameCount;
uniform vec2 uRandomSequence;
uniform Camera uCamera;
uniform World uWorld;
uniform int uSphereCount;
uniform sampler2D uSphereData;
uniform vec2 uSphereDataSize;
uniform int uSphereBvhNodeCount;
uniform sampler2D uSphereBvhNodeData;
uniform vec2 uSphereBvhNodeDataSize;
uniform sampler2D uSphereBvhIndexData;
uniform vec2 uSphereBvhIndexDataSize;
uniform int uQuadCount;
uniform int uTriangleCount;
uniform sampler2D uTriangleData;
uniform vec2 uTriangleDataSize;
uniform int uBvhNodeCount;
uniform sampler2D uBvhNodeData;
uniform vec2 uBvhNodeDataSize;
uniform sampler2D uBvhIndexData;
uniform vec2 uBvhIndexDataSize;
uniform Light uLights[MAX_LIGHTS];
uniform int uLightCount;
uniform int uIntegratorMode;
uniform int uTriangleTraversalMode;
uniform sampler2D uMaterialData;
uniform vec2 uMaterialDataSize;
uniform sampler2D uTextureData;
uniform vec2 uTextureDataSize;
uniform sampler2D uImageTexture0;
uniform sampler2D uImageTexture1;
uniform sampler2D uImageTexture2;
uniform sampler2D uImageTexture3;
uniform bool uObjectMaskEnabled;
uniform bool uObjectMaskHasSelection;

#include packedData.glsl
#include geometry.glsl
#include random.glsl
#include textures.glsl
#include materials.glsl
#include environment.glsl
// Light estimators are kept separate from path-state bookkeeping (STE-488).
#include lighting.glsl
#include camera.glsl
#include integrator.glsl
#include accumulation.glsl

void main() {
    if (uObjectMaskEnabled) {
        if (!uObjectMaskHasSelection) discard;
    }
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
    fragmentColor = vec4(accumulateSample(color), 1.0);
}
