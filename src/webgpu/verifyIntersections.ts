import * as THREE from 'three';
import {PresetPtScenes} from '../pathtracer/PresetPtScenes';
import SceneCompiler from '../pathtracer/SceneCompiler';
import {intersectQuad} from '../pathtracer/quadMath';
import {packAnalyticGeometry} from './geometry';
import {captureIntersections} from './IntersectionCapture';
import {buildSphereBvh} from '../pathtracer/SphereBvh';

/** Production scene compiler → WGSL hits → independent CPU analytic oracle.
 * This tests geometry only, not material shading or WebGL GPU parity.
 */
export async function verifyIntersections() {
    const scene = PresetPtScenes.RTIOW1Simple();
    const compiled = new SceneCompiler().compile(scene);
    try {
        const packed = packAnalyticGeometry(compiled);
        const rays: number[] = [];
        const add = (origin: THREE.Vector3, direction: THREE.Vector3) => rays.push(...origin.toArray(), 0.001, ...direction.normalize().toArray(), 10000);
        // Fixed center-of-pixel primary rays using the manifest's camera.
        for (let y=0;y<48;y++) for(let x=0;x<64;x++) {
            add(new THREE.Vector3(0,0.5,2),new THREE.Vector3((2*(x+0.5)/64-1)*4/3*Math.tan(Math.PI/8),(1-2*(y+0.5)/48)*Math.tan(Math.PI/8),-1));
        }
        // Include sphere interior exits and ground rays from both sides.
        for(const sphere of compiled.spheres) add(sphere.position.clone(),new THREE.Vector3(0.2,0.3,1));
        add(new THREE.Vector3(0,-2,0),new THREE.Vector3(0,1,0));
        add(new THREE.Vector3(2,1,0),new THREE.Vector3(0,-1,0));
        add(new THREE.Vector3(0,2,0),new THREE.Vector3(1,0,0));
        const input = new Float32Array(rays);
        const output = await captureIntersections(packed,input);
        const accelerated = await captureIntersections(packed,input,compiled.sphereBvh);
        const acceleratedFloats=new Float32Array(accelerated), acceleratedIds=new Uint32Array(accelerated);
        const floats = new Float32Array(output), ids = new Uint32Array(output);
        for(let i=0;i<input.length/8;i++) {
            if(acceleratedIds[i*8+7]!==0)throw new Error('BVH stack overflow');
            for(let k=0;k<6;k++)if(k<4?acceleratedFloats[i*8+k]!==floats[i*8+k]:acceleratedIds[i*8+k]!==ids[i*8+k])throw new Error(`BVH/linear mismatch at ray ${i}`);
        }
        let hits=0, misses=0, maxDistanceError=0;
        const kinds = new Set<number>();
        for(let i=0;i<input.length/8;i++) {
            const o=new THREE.Vector3().fromArray(input,i*8), d=new THREE.Vector3().fromArray(input,i*8+4);
            let nearest=10000, expectedId=0xffffffff, materialId=0xffffffff;
            let normal=new THREE.Vector3();
            compiled.spheres.forEach((sphere,index)=>{
                const oc=o.clone().sub(sphere.position), a=d.lengthSq(), b=oc.dot(d);
                const discriminant=b*b-a*(oc.lengthSq()-sphere.radius*sphere.radius);
                if(discriminant<0)return;
                let t=(-b-Math.sqrt(discriminant))/a;
                if(t<=input[i*8+3])t=(-b+Math.sqrt(discriminant))/a;
                if(t<=input[i*8+3]||t>=nearest)return;
                nearest=t;expectedId=index;materialId=sphere.materialId;
                normal=o.clone().addScaledVector(d,t).sub(sphere.position).normalize();
            });
            compiled.quads.forEach((quad,index)=>{
                const hit=intersectQuad(quad.q,quad.u,quad.v,o,d,input[i*8+3],nearest);
                if(!hit)return;
                nearest=hit.t;expectedId=compiled.spheres.length+index;materialId=quad.materialId;
                normal=new THREE.Vector3().crossVectors(quad.u,quad.v).normalize();
            });
            if(ids[i*8+4]!==expectedId||ids[i*8+5]!==materialId)throw new Error(`Hit identity mismatch on ray ${i}: ${ids[i*8+4]} vs ${expectedId}`);
            if(expectedId===0xffffffff){misses++;continue;}
            hits++;kinds.add(expectedId<compiled.spheres.length?0:1);
            const error=Math.abs(floats[i*8+3]-nearest);maxDistanceError=Math.max(maxDistanceError,error);
            const gpuNormal=new THREE.Vector3().fromArray(floats,i*8);
            if(!Number.isFinite(error)||error>1e-4*Math.max(1,Math.abs(nearest))||gpuNormal.dot(normal)<0.9999)throw new Error(`Hit distance/normal mismatch on ray ${i}`);
        }
        if(!hits||!misses||kinds.size!==2)throw new Error('Incomplete hit/miss/primitive coverage');
        // The baseline has only one leaf. Exercise internal nodes and stack
        // traversal separately with a deterministic 100-sphere fixture.
        const spheres=Array.from({length:100},(_,i)=>({position:new THREE.Vector3((i%10-4.5)*0.5,(Math.floor(i/10)-4.5)*0.5,-2),radius:0.19,materialId:i,uvMapping:0}));
        const stressGeometry=packAnalyticGeometry({spheres,quads:[],boxes:[],triangles:[]});
        const tree=buildSphereBvh(spheres);
        const linearStress=new Uint32Array(await captureIntersections(stressGeometry,input));
        const bvhStress=new Uint32Array(await captureIntersections(stressGeometry,input,tree));
        let sphereTests=0;
        for(let i=0;i<input.length/8;i++) {
            if(bvhStress[i*8+7])throw new Error('Stress BVH overflow');
            for(let k=0;k<6;k++)if(linearStress[i*8+k]!==bvhStress[i*8+k])throw new Error(`Stress BVH mismatch at ${i}`);
            sphereTests+=bvhStress[i*8+6];
        }
        if(tree.nodes.length<=1||sphereTests>=100*input.length/8)throw new Error('Stress test did not exercise BVH pruning');
        return {rays:input.length/8,hits,misses,maxDistanceError,spheres:compiled.spheres.length,quads:compiled.quads.length,bvhMatchesLinear:true,stress:{spheres:100,nodes:tree.nodes.length,depth:tree.stats.maxDepth,sphereTests},kind:'production geometry vs CPU oracle and sphere BVH; not transport parity'};
    } finally {
        compiled.dispose();
        scene.scene.traverse(object=>{if(object instanceof THREE.Mesh){object.geometry.dispose();for(const m of Array.isArray(object.material)?object.material:[object.material])m.dispose();}});
        scene.rasterGradientEnvironmentTexture?.dispose();
    }
}
