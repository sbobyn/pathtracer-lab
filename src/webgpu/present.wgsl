struct Params { size: vec2u, sampleIndex: u32, seed: u32 }
@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> accumulation: array<vec4f>;
@vertex fn vertexMain(@builtin(vertex_index) index: u32) -> @builtin(position) vec4f {
    let positions = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
    return vec4f(positions[index], 0.0, 1.0);
}
@fragment fn fragmentMain(@builtin(position) position: vec4f) -> @location(0) vec4f {
    let pixel = vec2u(position.xy);
    let linear = max(accumulation[pixel.y * params.size.x + pixel.x].xyz, vec3f(0.0));
    let srgb = select(1.055 * pow(linear, vec3f(1.0 / 2.4)) - 0.055, 12.92 * linear, linear <= vec3f(0.0031308));
    return vec4f(srgb, 1.0);
}
