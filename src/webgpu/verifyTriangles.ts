import * as THREE from 'three';
import {PresetPtScenes} from '../pathtracer/PresetPtScenes';
import SceneCompiler from '../pathtracer/SceneCompiler';
import {hitTriangleDistance} from '../pathtracer/TriangleBvh';
import {packAnalyticGeometry} from './geometry';
import {captureIntersections} from './IntersectionCapture';

export async function verifyTriangles() {
    const scene=PresetPtScenes.PackedTrianglesStudy();
    const compiled=new SceneCompiler().compile(scene);
    try {
        // Explicit triangle-only subset isolates triangle intersection/BVH errors.
        const geometry=packAnalyticGeometry({spheres:[],quads:[],boxes:[],triangles:compiled.triangles});
        const rays:number[]=[];
        const origin=new THREE.Vector3(4.8,3.5,5.8);
        const forward=new THREE.Vector3(0,-0.3,-0.7).sub(origin).normalize();
        const right=new THREE.Vector3().crossVectors(forward,new THREE.Vector3(0,1,0)).normalize();
        const up=new THREE.Vector3().crossVectors(right,forward);
        for(let y=0;y<24;y++)for(let x=0;x<32;x++) {
            const direction=forward.clone().addScaledVector(right,(2*(x+0.5)/32-1)*4/3*Math.tan(43*Math.PI/360)).addScaledVector(up,(1-2*(y+0.5)/24)*Math.tan(43*Math.PI/360)).normalize();
            rays.push(...origin.toArray(),0.001,...direction.toArray(),10000);
        }
        const input=new Float32Array(rays);
        const linear=await captureIntersections(geometry,input);
        const accelerated=await captureIntersections(geometry,input,compiled.triangleBvh);
        const f=new Float32Array(accelerated),u=new Uint32Array(accelerated),baseline=new Uint32Array(linear);
        let hits=0,misses=0,triangleTests=0,maxDistanceError=0;
        for(let i=0;i<input.length/8;i++) {
            if(u[i*8+7])throw new Error('Triangle BVH stack overflow');
            for(let k=0;k<6;k++)if(u[i*8+k]!==baseline[i*8+k])throw new Error(`Triangle BVH/linear mismatch on ray ${i}`);
            triangleTests+=u[i*8+6];
            const ray={origin:new THREE.Vector3().fromArray(input,i*8),direction:new THREE.Vector3().fromArray(input,i*8+4)};
            let distance=10000,index=-1;
            compiled.triangles.forEach((triangle,j)=>{const t=hitTriangleDistance(triangle,ray,0.001,distance);if(t!==null){distance=t;index=j;}});
            if(u[i*8+4] !== (index<0?0xffffffff:index))throw new Error(`CPU triangle identity mismatch on ray ${i}`);
            if(index<0){misses++;continue;}
            hits++;
            const triangle=compiled.triangles[index];
            if(u[i*8+5]!==triangle.materialId)throw new Error('Triangle material mismatch');
            const error=Math.abs(distance-f[i*8+3]);maxDistanceError=Math.max(error,maxDistanceError);
            const normal=new THREE.Vector3().crossVectors(triangle.b.clone().sub(triangle.a),triangle.c.clone().sub(triangle.a)).normalize();
            if(!Number.isFinite(error)||error>1e-4*Math.max(1,Math.abs(distance))||normal.dot(new THREE.Vector3().fromArray(f,i*8))<0.9999)throw new Error('Triangle distance/normal mismatch');
        }
        if(!hits||!misses)throw new Error('Insufficient triangle test coverage');
        return {triangles:compiled.triangles.length,nodes:compiled.triangleBvh.nodes.length,rays:input.length/8,hits,misses,maxDistanceError,triangleTests,kind:'packed scene triangle-only subset; geometric normals, not shading/UV parity'};
    } finally {
        compiled.dispose();
        scene.scene.traverse(object=>{if(object instanceof THREE.Mesh){object.geometry.dispose();for(const m of Array.isArray(object.material)?object.material:[object.material])m.dispose();}});
        scene.rasterGradientEnvironmentTexture?.dispose();
    }
}
