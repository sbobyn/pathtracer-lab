struct Params {
    size: vec2u, sampleIndex: u32, seed: u32,
    origin: vec4f, forward: vec4f, right: vec4f, up: vec4f
}
@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read_write> accumulation: array<vec4f>;

fn random(state: ptr<function, u32>) -> f32 {
    *state = *state * 747796405u + 2891336453u;
    let word = ((*state >> ((*state >> 28u) + 4u)) ^ *state) * 277803737u;
    return f32((word >> 22u) ^ word) * (1.0 / 4294967296.0);
}

// Three diffuse spheres, including a large ground sphere. This is a bring-up
// fixture, not yet an adapter for the production scene or parity manifest.
fn sphere(index: u32) -> vec4f {
    if index == 0u { return vec4f(0.0, -100.5, -1.0, 100.0); }
    if index == 1u { return vec4f(0.0, 0.0, -1.0, 0.5); }
    return vec4f(1.0, 0.0, -1.6, 0.5);
}

fn trace(origin: vec3f, direction: vec3f, state: ptr<function, u32>) -> vec3f {
    var ro = origin;
    var rd = direction;
    var throughput = vec3f(1.0);
    for (var bounce = 0u; bounce < 8u; bounce++) {
        var nearest = 1e20;
        var hit = 3u;
        for (var i = 0u; i < 3u; i++) {
            let s = sphere(i);
            let oc = ro - s.xyz;
            let halfB = dot(oc, rd);
            let discriminant = halfB * halfB - dot(oc, oc) + s.w * s.w;
            if discriminant >= 0.0 {
                var t = -halfB - sqrt(discriminant);
                if t <= 0.0001 { t = -halfB + sqrt(discriminant); }
                if t > 0.0001 && t < nearest { nearest = t; hit = i; }
            }
        }
        if hit == 3u {
            let sky = mix(vec3f(1.0), vec3f(0.45, 0.65, 1.0), 0.5 * (rd.y + 1.0));
            return throughput * sky;
        }
        let p = ro + nearest * rd;
        let normal = normalize(p - sphere(hit).xyz);
        let z = 1.0 - 2.0 * random(state);
        let phi = 6.28318530718 * random(state);
        let r = sqrt(max(0.0, 1.0 - z * z));
        let candidate = normal + vec3f(r * cos(phi), r * sin(phi), z);
        rd = normal;
        if dot(candidate, candidate) > 1e-12 { rd = normalize(candidate); }
        ro = p + normal * 0.0001;
        var albedo = vec3f(0.65, 0.65, 0.65);
        if hit == 1u { albedo = vec3f(0.8, 0.22, 0.08); }
        if hit == 2u { albedo = vec3f(0.12, 0.3, 0.8); }
        // normal + a uniform unit vector gives cosine-weighted diffuse sampling.
        throughput *= albedo;
    }
    return vec3f(0.0);
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
    if any(id.xy >= params.size) { return; }
    let index = id.y * params.size.x + id.x;
    var state = index ^ (params.sampleIndex * 277803737u) ^ params.seed;
    let jitter = vec2f(random(&state), random(&state));
    let uv = (vec2f(id.xy) + jitter) / vec2f(params.size);
    let aspect = f32(params.size.x) / f32(params.size.y);
    let direction = normalize(params.forward.xyz + (2.0 * uv.x - 1.0) * aspect * params.forward.w * params.right.xyz + (1.0 - 2.0 * uv.y) * params.forward.w * params.up.xyz);
    let radiance = trace(params.origin.xyz, direction, &state);
    var mean = radiance;
    if params.sampleIndex > 0u {
        let previous = accumulation[index].xyz;
        mean = previous + (radiance - previous) / f32(params.sampleIndex + 1u);
    }
    accumulation[index] = vec4f(mean, 1.0);
}
