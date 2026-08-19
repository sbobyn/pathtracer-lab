// Hash without Sine: https://www.shadertoy.com/view/4djSRW
float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * .1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

vec2 hash22(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973));
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.xx + p3.yz) * p3.zy);
}

vec3 hash32(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973));
    p3 += dot(p3, p3.yxz + 33.33);
    return fract((p3.xxy + p3.yzz) * p3.zyx);
}

vec3 randomOnUnitSphere(vec2 p) {
    vec3 randomValue = hash32(p);
    float phi = 2.0 * PI * randomValue.x;
    float cosTheta = 2.0 * randomValue.y - 1.0;
    float theta = acos(cosTheta);
    return vec3(sin(theta) * cos(phi), sin(theta) * sin(phi), cos(theta));
}

vec2 sampleUnitDisk(vec2 u) {
    float a = 2.0 * u.x - 1.0;
    float b = 2.0 * u.y - 1.0;
    float r;
    float phi;
    if (a == 0.0 && b == 0.0) {
        r = 0.0;
        phi = 0.0;
    } else if (abs(a) > abs(b)) {
        r = a;
        phi = (PI / 4.0) * (b / a);
    } else {
        r = b;
        phi = (PI / 2.0) - (PI / 4.0) * (a / b);
    }
    return r * vec2(cos(phi), sin(phi));
}
