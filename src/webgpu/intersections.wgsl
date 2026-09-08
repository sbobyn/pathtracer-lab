struct Primitive { a: vec4f, b: vec4f, c: vec4f, d: vec4f }
struct Ray { origin: vec4f, direction: vec4f }
struct Hit { normalDistance: vec4f, ids: vec4u }
@group(0) @binding(0) var<storage, read> primitives: array<Primitive>;
@group(0) @binding(1) var<storage, read_write> rays: array<Ray>;
@group(0) @binding(2) var<storage, read_write> hits: array<Hit>;
struct Node { low: vec4f, high: vec4f }
@group(0) @binding(3) var<storage, read> nodes: array<Node>;
@group(0) @binding(4) var<storage, read> indices: array<f32>;
struct Attributes { na: vec4f, nb: vec4f, nc: vec4f, uvab: vec4f, uvc: vec4f }
struct Surface { normalFace: vec4f, uvBarycentric: vec4f }
@group(0) @binding(5) var<storage, read> attributes: array<Attributes>;
@group(0) @binding(6) var<storage, read_write> surfaces: array<Surface>;

fn storeHit(index: u32, hit: Hit) {
    hits[index]=hit;
    var normal=hit.normalDistance.xyz;
    var uv=vec2f(0.0);
    var bary=vec2f(0.0);
    var face=0.0;
    if hit.ids.x != 0xffffffffu {
        let ray=rays[index];
        let p=primitives[hit.ids.x];
        face=select(-1.0,1.0,dot(ray.direction.xyz,normal)<0.0);
        if p.b.w == 2.0 {
            let e1=p.b.xyz-p.a.xyz;let e2=p.c.xyz-p.a.xyz;
            let h=cross(ray.direction.xyz,e2);
            let inverse=1.0/dot(e1,h);
            let s=ray.origin.xyz-p.a.xyz;
            bary=vec2f(dot(s,h)*inverse,dot(ray.direction.xyz,cross(s,e1))*inverse);
            let a=attributes[hit.ids.x];
            let w=1.0-bary.x-bary.y;
            let interpolated=w*a.na.xyz+bary.x*a.nb.xyz+bary.y*a.nc.xyz;
            if dot(interpolated,interpolated)>1e-12 { normal=normalize(interpolated); }
            if dot(normal,hit.normalDistance.xyz)<0.0 { normal=-normal; }
            uv=w*a.uvab.xy+bary.x*a.uvab.zw+bary.y*a.uvc.xy;
        }
        normal*=face;
    }
    surfaces[index]=Surface(vec4f(normal,face),vec4f(uv,bary));
}

fn scan(ray: Ray, first: u32, end: u32) -> Hit {
    var closest = ray.direction.w;
    var normal = vec3f(0.0);
    var primitiveId = 0xffffffffu;
    var materialId = 0xffffffffu;
    for(var i=first; i<end; i++) {
        let p = primitives[i];
        var t = closest;
        var n = vec3f(0.0);
        var valid = false;
        if p.b.w == 0.0 {
            let oc = ray.origin.xyz - p.a.xyz;
            let a = dot(ray.direction.xyz, ray.direction.xyz);
            let halfB = dot(oc, ray.direction.xyz);
            let discriminant = halfB * halfB - a * (dot(oc, oc) - p.a.w * p.a.w);
            if discriminant >= 0.0 {
                t = (-halfB - sqrt(discriminant)) / a;
                if t <= ray.origin.w { t = (-halfB + sqrt(discriminant)) / a; }
                valid = t > ray.origin.w && t < closest;
                if valid { n = normalize(ray.origin.xyz + t * ray.direction.xyz - p.a.xyz); }
            }
        } else if p.b.w == 2.0 {
            let edge1=p.b.xyz-p.a.xyz;
            let edge2=p.c.xyz-p.a.xyz;
            let h=cross(ray.direction.xyz,edge2);
            let determinant=dot(edge1,h);
            if abs(determinant)>1e-8 {
                let inverse=1.0/determinant;
                let s=ray.origin.xyz-p.a.xyz;
                let u=inverse*dot(s,h);
                let q=cross(s,edge1);
                let v=inverse*dot(ray.direction.xyz,q);
                t=inverse*dot(edge2,q);
                valid=u>=0.0 && v>=0.0 && u+v<=1.0 && t>ray.origin.w && t<closest;
                if valid { n=normalize(cross(edge1,edge2)); }
            }
        } else {
            let crossUv = cross(p.b.xyz, p.c.xyz);
            let lengthSquared = dot(crossUv, crossUv);
            if lengthSquared >= 1e-12 {
                n = normalize(crossUv);
                let denominator = dot(n, ray.direction.xyz);
                if abs(denominator) >= 1e-8 {
                    t = dot(n, p.a.xyz - ray.origin.xyz) / denominator;
                    let planar = ray.origin.xyz + t * ray.direction.xyz - p.a.xyz;
                    let w = crossUv / lengthSquared;
                    let alpha = dot(w, cross(planar, p.c.xyz));
                    let beta = dot(w, cross(p.b.xyz, planar));
                    valid = t > ray.origin.w && t < closest && alpha >= 0.0 && alpha <= 1.0 && beta >= 0.0 && beta <= 1.0;
                }
            }
        }
        if valid { closest = t; normal = n; primitiveId = i; materialId = u32(p.c.w); }
    }
    return Hit(vec4f(normal, closest), vec4u(primitiveId, materialId, 0u, 0u));
}

fn boundsHit(ray: Ray, node: Node) -> bool {
    var lo = ray.origin.w;
    var hi = ray.direction.w;
    for(var axis=0u; axis<3u; axis++) {
        let direction = ray.direction[axis];
        if direction == 0.0 {
            if ray.origin[axis] < node.low[axis] || ray.origin[axis] > node.high[axis] { return false; }
        } else {
            let a = (node.low[axis] - ray.origin[axis]) / direction;
            let b = (node.high[axis] - ray.origin[axis]) / direction;
            lo = max(lo, min(a,b)); hi = min(hi,max(a,b));
            if hi < lo { return false; }
        }
    }
    return true;
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
    if id.x >= arrayLength(&rays) { return; }
    if nodes[0].low.x == 0.0 { storeHit(id.x,scan(rays[id.x], 0u, arrayLength(&primitives))); return; }
    var ray = rays[id.x];
    var result = Hit(vec4f(0.0,0.0,0.0,ray.direction.w),vec4u(0xffffffffu,0xffffffffu,0u,0u));
    var stack: array<u32,64>;
    stack[0] = 0u;
    var size = 1u;
    var tests = 0u;
    loop {
        if size == 0u { break; }
        size--;
        let index = stack[size];
        let node = nodes[index + 1u];
        if !boundsHit(ray,node) { continue; }
        let count = u32(node.high.w);
        if count > 0u {
            for(var offset=0u;offset<count;offset++) {
                let primitive = u32(indices[u32(node.low.w)+offset]) + u32(nodes[0].low.z);
                let hit = scan(ray,primitive,primitive+1u);
                tests++;
                if hit.ids.x != 0xffffffffu { result=hit;ray.direction.w=hit.normalDistance.w; }
            }
        } else {
            // The host validates tree depth before dispatch; flag overflow too.
            if size + 2u > 64u { result.ids.w=1u;storeHit(id.x,result);return; }
            stack[size]=u32(node.low.w);stack[size+1u]=index+1u;size+=2u;
        }
    }
    let prefixHit=scan(ray,0u,u32(nodes[0].low.z));
    if prefixHit.ids.x != 0xffffffffu { result=prefixHit;ray.direction.w=prefixHit.normalDistance.w; }
    let quadHit=scan(ray,u32(nodes[0].low.z+nodes[0].low.y),arrayLength(&primitives));
    if quadHit.ids.x != 0xffffffffu { result=quadHit; }
    result.ids.z=tests;
    storeHit(id.x,result);
}
