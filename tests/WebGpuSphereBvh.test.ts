import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3} from 'three';
import {buildSphereBvh} from '../src/pathtracer/SphereBvh.ts';
import {packSphereBvh} from '../src/webgpu/sphereBvh.ts';
const spheres=Array.from({length:20},(_,i)=>({position:new Vector3(i,0,0),radius:0.4,materialId:0,uvMapping:0}));
test('WebGPU packing preserves production sphere BVH nodes and references',()=>{
    const tree=buildSphereBvh(spheres);
    const packed=packSphereBvh(tree,spheres.length);
    assert.equal(packed.nodes[0],1);assert.equal(packed.nodes[1],20);
    assert.equal(packed.nodes.length,(tree.nodes.length+1)*8);
    assert.deepEqual(Array.from(packed.indices),tree.sphereIndices);
    tree.nodes.forEach((node,i)=>{assert.equal(packed.nodes[(i+1)*8+3],node.payload);assert.equal(packed.nodes[(i+1)*8+7],node.triangleCount);});
});
test('WebGPU BVH packing rejects invalid indices, leaves and bounds',()=>{
    let tree=buildSphereBvh(spheres);tree.sphereIndices[0]=999;
    assert.throws(()=>packSphereBvh(tree,20));
    tree=buildSphereBvh(spheres);tree.nodes.find(n=>n.triangleCount>0)!.payload=999;
    assert.throws(()=>packSphereBvh(tree,20));
    tree=buildSphereBvh(spheres);tree.nodes[0].boundsMin.x=Infinity;
    assert.throws(()=>packSphereBvh(tree,20));
    tree=buildSphereBvh(spheres);tree.nodes[0].payload=0;
    assert.throws(()=>packSphereBvh(tree,20));
});
