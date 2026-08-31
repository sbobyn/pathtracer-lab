const int TRIANGLE_TEXELS = 8;
const int SPHERE_TEXELS = 2;
const int MATERIAL_TEXELS = 7;
const int TEXTURE_TEXELS = 3;

vec4 readPackedTexel(sampler2D dataTexture, vec2 dataSize, int linearIndex) {
    int width = int(dataSize.x);
    return texelFetch(dataTexture, ivec2(linearIndex % width, linearIndex / width), 0);
}

vec4 readTriangleTexel(int triangleIndex, int texelOffset) {
    int linearIndex = triangleIndex * TRIANGLE_TEXELS + texelOffset;
    return readPackedTexel(uTriangleData, uTriangleDataSize, linearIndex);
}

Sphere readSphere(int sphereIndex) {
    int base = sphereIndex * SPHERE_TEXELS;
    vec4 geometry = readPackedTexel(uSphereData, uSphereDataSize, base);
    vec4 properties = readPackedTexel(uSphereData, uSphereDataSize, base + 1);
    return Sphere(geometry.xyz, geometry.w, int(round(properties.x)), int(round(properties.y)));
}

Material readMaterial(int materialIndex) {
    int base = materialIndex * MATERIAL_TEXELS;
    vec4 surface = readPackedTexel(uMaterialData, uMaterialDataSize, base);
    vec4 baseColor = readPackedTexel(uMaterialData, uMaterialDataSize, base + 1);
    vec4 emission = readPackedTexel(uMaterialData, uMaterialDataSize, base + 2);
    vec4 flags = readPackedTexel(uMaterialData, uMaterialDataSize, base + 3);
    vec4 transmission = readPackedTexel(uMaterialData, uMaterialDataSize, base + 4);
    vec4 attenuation = readPackedTexel(uMaterialData, uMaterialDataSize, base + 5);
    vec4 volume = readPackedTexel(uMaterialData, uMaterialDataSize, base + 6);
    return Material(
        int(round(surface.x)), int(round(surface.y)), int(round(surface.z)), int(round(flags.y)),
        int(round(transmission.x)), int(round(transmission.z)), int(round(flags.w)),
        baseColor.rgb, emission.rgb, attenuation.rgb,
        surface.w, flags.z, baseColor.w, transmission.y, transmission.w,
        volume.x, attenuation.w, emission.w, flags.x > 0.5
    );
}

Texture readTexture(int textureIndex) {
    int base = textureIndex * TEXTURE_TEXELS;
    vec4 properties = readPackedTexel(uTextureData, uTextureDataSize, base);
    vec4 colorA = readPackedTexel(uTextureData, uTextureDataSize, base + 1);
    vec4 colorB = readPackedTexel(uTextureData, uTextureDataSize, base + 2);
    return Texture(
        int(round(properties.x)), colorA.rgb, colorB.rgb,
        properties.z, properties.w, int(round(properties.y))
    );
}

Triangle readTriangle(int triangleIndex) {
    vec4 a = readTriangleTexel(triangleIndex, 0);
    vec4 b = readTriangleTexel(triangleIndex, 1);
    vec4 c = readTriangleTexel(triangleIndex, 2);
    vec4 normalA = readTriangleTexel(triangleIndex, 3);
    vec4 normalB = readTriangleTexel(triangleIndex, 4);
    vec4 normalC = readTriangleTexel(triangleIndex, 5);
    vec4 uvAB = readTriangleTexel(triangleIndex, 6);
    vec4 uvC = readTriangleTexel(triangleIndex, 7);
    return Triangle(
        a.xyz, b.xyz, c.xyz,
        normalA.xyz, normalB.xyz, normalC.xyz,
        uvAB.xy, uvAB.zw, uvC.xy,
        int(round(a.w))
    );
}

void readBvhNode(int nodeIndex, out vec3 boundsMin, out vec3 boundsMax, out int payload, out int triangleCount) {
    int base = nodeIndex * 2;
    vec4 minimum = readPackedTexel(uBvhNodeData, uBvhNodeDataSize, base);
    vec4 maximum = readPackedTexel(uBvhNodeData, uBvhNodeDataSize, base + 1);
    boundsMin = minimum.xyz;
    boundsMax = maximum.xyz;
    payload = int(round(minimum.w));
    triangleCount = int(round(maximum.w));
}

int readBvhTriangleIndex(int indexOffset) {
    return int(round(readPackedTexel(uBvhIndexData, uBvhIndexDataSize, indexOffset).x));
}

void readSphereBvhNode(int nodeIndex, out vec3 boundsMin, out vec3 boundsMax, out int payload, out int sphereCount) {
    int base = nodeIndex * 2;
    vec4 minimum = readPackedTexel(uSphereBvhNodeData, uSphereBvhNodeDataSize, base);
    vec4 maximum = readPackedTexel(uSphereBvhNodeData, uSphereBvhNodeDataSize, base + 1);
    boundsMin = minimum.xyz;
    boundsMax = maximum.xyz;
    payload = int(round(minimum.w));
    sphereCount = int(round(maximum.w));
}

int readSphereBvhIndex(int indexOffset) {
    return int(round(readPackedTexel(uSphereBvhIndexData, uSphereBvhIndexDataSize, indexOffset).x));
}
