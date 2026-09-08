import type {SphereBvh} from '../pathtracer/SphereBvh.ts';
import {describeSphereBvh} from '../pathtracer/SphereBvh.ts';

export function packSphereBvh(tree: SphereBvh, sphereCount: number) {
    const info=describeSphereBvh(tree);
    if (!sphereCount || info.filter(Boolean).length!==tree.nodes.length || info.some(n=>n.depth>62)) throw new Error('Invalid or too-deep sphere BVH');
    if (tree.sphereIndices.length!==sphereCount || new Set(tree.sphereIndices).size!==sphereCount || tree.sphereIndices.some(i=>!Number.isInteger(i)||i<0||i>=sphereCount)) throw new Error('Invalid sphere BVH references');
    const nodes=new Float32Array((tree.nodes.length+1)*8);
    nodes[0]=1;nodes[1]=sphereCount;
    tree.nodes.forEach((node,i)=>{
        if (node.boundsMin.x>node.boundsMax.x||node.boundsMin.y>node.boundsMax.y||node.boundsMin.z>node.boundsMax.z)throw new Error('Reversed BVH bounds');
        if (!Number.isSafeInteger(node.payload)||node.payload<0||node.payload>0xffffff||!Number.isSafeInteger(node.triangleCount)||node.triangleCount<0||node.triangleCount>0xffffff)throw new Error('Invalid node metadata');
        if(node.triangleCount && node.payload+node.triangleCount>sphereCount)throw new Error('Invalid leaf range');
        nodes.set([...node.boundsMin.toArray(),node.payload,...node.boundsMax.toArray(),node.triangleCount],(i+1)*8);
    });
    if(!nodes.every(Number.isFinite))throw new Error('Non-finite BVH bounds');
    return {nodes,indices:new Float32Array(tree.sphereIndices)};
}
