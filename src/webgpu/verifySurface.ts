import {Vector2,Vector3} from 'three';
import {packAnalyticGeometry,packSurfaceAttributes} from './geometry';
import {captureIntersections} from './IntersectionCapture';
import {buildTriangleBvh} from '../pathtracer/TriangleBvh';

export async function verifySurface() {
    const triangle={a:new Vector3(0,0,0),b:new Vector3(1,0,0),c:new Vector3(0,1,0),normalA:new Vector3(0,0,1),normalB:new Vector3(0,0.6,0.8),normalC:new Vector3(0.6,0,0.8),uvA:new Vector2(-1,2),uvB:new Vector2(3,2),uvC:new Vector2(-1,6),materialId:0};
    const scene={spheres:[],quads:[],boxes:[],triangles:[triangle]};
    const geometry=packAnalyticGeometry(scene),tree=buildTriangleBvh(scene.triangles);
    const rays=new Float32Array([0.25,0.25,1,0.001,0,0,-1,100,0.25,0.25,-1,0.001,0,0,1,100,2,2,1,0.001,0,0,-1,100]);
    const capture=async()=>new Float32Array(await captureIntersections(geometry,rays,tree,{attributes:packSurfaceAttributes(scene),readSurface:true}));
    const check=(data:Float32Array,expected:Vector3)=>{
        if(!data.every(Number.isFinite))throw new Error('Non-finite interpolated surface');
        for(let i=0;i<2;i++) {
            const sign=i===0?1:-1;
            if(new Vector3().fromArray(data,i*8).dot(expected.clone().multiplyScalar(sign))<0.99999)throw new Error('Interpolated normal mismatch');
            if(data[i*8+3]!==sign||Math.abs(data[i*8+4])>1e-6||Math.abs(data[i*8+5]-3)>1e-6||Math.abs(data[i*8+6]-0.25)>1e-6||Math.abs(data[i*8+7]-0.25)>1e-6)throw new Error('UV/barycentric/front-face mismatch');
        }
        if(data.slice(16).some(v=>v!==0))throw new Error('Miss surface is not cleared');
    };
    const expected=new Vector3(0.15,0.15,0.9).normalize();
    check(await capture(),expected);
    for(const n of [triangle.normalA,triangle.normalB,triangle.normalC])n.negate();
    check(await capture(),expected);
    for(const n of [triangle.normalA,triangle.normalB,triangle.normalC])n.set(0,0,0);
    check(await capture(),new Vector3(0,0,1));
    return {smoothNormals:true,unclampedUvs:true,barycentrics:true,frontBack:true,reversedNormalCorrection:true,zeroNormalFallback:true,missCleared:true};
}
