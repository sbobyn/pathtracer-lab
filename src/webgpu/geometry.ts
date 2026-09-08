import type GpuScene from '../pathtracer/GpuScene';

/** Geometry-only diagnostic layout: four vec4s per primitive.
 * a.xyz = sphere center / quad Q; a.w = sphere radius (0 for quad).
 * b.xyz = quad U; b.w = kind (0 sphere, 1 quad, 2 triangle).
 * c.xyz = quad V; c.w = material id; d is reserved.
 * Triangles store vertices A/B/C in a/b/c.xyz, with geometric normals computed
 * at intersection time. IDs are spheres, then quads, then triangles.
 */
export function packAnalyticGeometry(scene: Pick<GpuScene, 'spheres' | 'quads' | 'boxes' | 'triangles'>) {
    if (scene.boxes.length) throw new Error('Diagnostic does not support boxes yet.');
    const count = scene.spheres.length + scene.quads.length + scene.triangles.length;
    if (!count) throw new Error('Analytic diagnostic requires geometry.');
    for (const primitive of [...scene.spheres, ...scene.quads, ...scene.triangles]) {
        if (!Number.isSafeInteger(primitive.materialId) || primitive.materialId < 0 || primitive.materialId > 0xffffff) throw new Error('Material ID is not exactly representable in the diagnostic layout.');
    }
    const data = new Float32Array(count * 16);
    scene.spheres.forEach((s, i) => {
        if (!(s.radius > 0)) throw new Error('Invalid sphere radius');
        data.set([s.position.x, s.position.y, s.position.z, s.radius, 0, 0, 0, 0, 0, 0, 0, s.materialId], i * 16);
    });
    scene.quads.forEach((q, i) => {
        data.set([q.q.x,q.q.y,q.q.z,0,q.u.x,q.u.y,q.u.z,1,q.v.x,q.v.y,q.v.z,q.materialId], (scene.spheres.length + i) * 16);
    });
    scene.triangles.forEach((t,i)=>{
        data.set([t.a.x,t.a.y,t.a.z,0,t.b.x,t.b.y,t.b.z,2,t.c.x,t.c.y,t.c.z,t.materialId],(scene.spheres.length+scene.quads.length+i)*16);
    });
    if (!data.every(Number.isFinite)) throw new Error('Non-finite geometry');
    return data;
}

/** Five vec4s per primitive: triangle normals A/B/C, UV A/B, UV C. */
export function packSurfaceAttributes(scene: Pick<GpuScene, 'spheres' | 'quads' | 'triangles'>) {
    const result=new Float32Array((scene.spheres.length+scene.quads.length+scene.triangles.length)*20);
    scene.triangles.forEach((t,i)=>{
        result.set([...t.normalA.toArray(),0,...t.normalB.toArray(),0,...t.normalC.toArray(),0,...t.uvA.toArray(),...t.uvB.toArray(),...t.uvC.toArray(),0,0],(scene.spheres.length+scene.quads.length+i)*20);
    });
    if(!result.every(Number.isFinite))throw new Error('Non-finite surface attributes');
    return result;
}
