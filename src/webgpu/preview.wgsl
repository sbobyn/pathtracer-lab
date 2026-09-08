struct Camera { size: vec2u, unused: u32, mode: u32, origin: vec4f, forward: vec4f, right: vec4f, up: vec4f }
@group(0) @binding(7) var<uniform> camera: Camera;

@compute @workgroup_size(8,8)
fn generateRays(@builtin(global_invocation_id) id: vec3u) {
    if any(id.xy>=camera.size) { return; }
    let uv=(vec2f(id.xy)+0.5)/vec2f(camera.size);
    let direction=normalize(camera.forward.xyz+(2.0*uv.x-1.0)*f32(camera.size.x)/f32(camera.size.y)*camera.forward.w*camera.right.xyz+(1.0-2.0*uv.y)*camera.forward.w*camera.up.xyz);
    rays[id.y*camera.size.x+id.x]=Ray(vec4f(camera.origin.xyz,0.001),vec4f(direction,10000.0));
}

@vertex fn previewVertex(@builtin(vertex_index) index:u32)->@builtin(position) vec4f {
    let positions=array<vec2f,3>(vec2f(-1.0,-1.0),vec2f(3.0,-1.0),vec2f(-1.0,3.0));
    return vec4f(positions[index],0.0,1.0);
}
@fragment fn previewFragment(@builtin(position) position:vec4f)->@location(0) vec4f {
    let index=u32(position.y)*camera.size.x+u32(position.x);
    let hit=hits[index];
    if hit.ids.x==0xffffffffu { return vec4f(0.06,0.07,0.09,1.0); }
    let surface=surfaces[index];
    var color=0.5+0.5*surface.normalFace.xyz;
    if camera.mode==1u {
        let checker=(i32(floor(surface.uvBarycentric.x*16.0))+i32(floor(surface.uvBarycentric.y*16.0)))&1;
        color=select(vec3f(0.12),vec3f(0.9),checker==0);
    }
    if camera.mode==2u { color=vec3f(surface.uvBarycentric.zw,1.0-surface.uvBarycentric.z-surface.uvBarycentric.w); }
    return vec4f(color,1.0);
}
