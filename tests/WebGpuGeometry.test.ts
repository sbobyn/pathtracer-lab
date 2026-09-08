import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector2, Vector3} from 'three';
import {packAnalyticGeometry,packSurfaceAttributes} from '../src/webgpu/geometry.ts';

const fixture = () => ({spheres:[{position:new Vector3(1,2,3),radius:0.5,materialId:2,uvMapping:0}], quads:[{q:new Vector3(),u:new Vector3(2,0,0),v:new Vector3(0,0,2),normal:new Vector3(0,-1,0),materialId:3}],boxes:[],triangles:[]});
test('WebGPU analytic packing preserves geometry, primitive kind and material IDs',()=>{
    const packed=packAnalyticGeometry(fixture());
    assert.equal(packed.length,32);
    assert.deepEqual(Array.from(packed.slice(0,4)),[1,2,3,0.5]);
    assert.equal(packed[7],0);assert.equal(packed[11],2);
    assert.equal(packed[23],1);assert.equal(packed[27],3);
    assert.equal(packed[20],2);assert.equal(packed[26],2);
});
test('WebGPU analytic packing refuses incomplete or invalid scenes',()=>{
    assert.throws(()=>packAnalyticGeometry({...fixture(),spheres:[],quads:[]}));
    const invalid=fixture();invalid.spheres[0].radius=-1;assert.throws(()=>packAnalyticGeometry(invalid));
    invalid.spheres[0].radius=0.5;invalid.spheres[0].materialId=0.5;assert.throws(()=>packAnalyticGeometry(invalid));
    invalid.spheres[0].materialId=0;invalid.spheres[0].position.x=Infinity;assert.throws(()=>packAnalyticGeometry(invalid));
    assert.throws(()=>packAnalyticGeometry({...fixture(),boxes:[{} as never]}),/does not support/);
});
test('WebGPU triangle packing preserves vertex order and material identity',()=>{
    const triangle={a:new Vector3(1,2,3),b:new Vector3(4,5,6),c:new Vector3(7,8,9),normalA:new Vector3(),normalB:new Vector3(),normalC:new Vector3(),uvA:new Vector2(),uvB:new Vector2(),uvC:new Vector2(),materialId:7};
    const packed=packAnalyticGeometry({...fixture(),triangles:[triangle]});
    assert.deepEqual(Array.from(packed.slice(32,44)),[1,2,3,0,4,5,6,2,7,8,9,7]);
    triangle.normalA.set(0,0,1);triangle.uvA.set(-1,2);triangle.uvB.set(3,2);triangle.uvC.set(-1,6);
    const attributes=packSurfaceAttributes({...fixture(),triangles:[triangle]});
    assert.equal(attributes.length,60);
    assert.deepEqual(Array.from(attributes.slice(40,44)),[0,0,1,0]);
    assert.deepEqual(Array.from(attributes.slice(52,58)),[-1,2,3,2,-1,6]);
    triangle.uvA.x=NaN;
    assert.throws(()=>packSurfaceAttributes({...fixture(),triangles:[triangle]}),/Non-finite/);
});
