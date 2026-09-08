/// <reference types="@webgpu/types" />
import source from './intersections.wgsl?raw';
import type {SphereBvh} from '../pathtracer/SphereBvh.ts';
import type {TriangleBvh} from '../pathtracer/TriangleBvh.ts';
import {packSphereBvh} from './sphereBvh';

/** Dedicated diagnostic device. Inputs: 16 floats/primitive, 8 floats/ray.
 * Rays carry minimum t in origin.w and maximum t in direction.w.
 * Output: 32 bytes/ray; normal.xyz/distance followed by uint primitive/material IDs.
 * With readSurface: eight floats/ray (oriented shading normal, front-face sign,
 * UV.xy, barycentric B/C). Sphere/quad UVs are not implemented by this diagnostic.
 */
export async function captureIntersections(geometry: Float32Array, rays: Float32Array, bvh?: SphereBvh | TriangleBvh, surface?: {attributes: Float32Array; readSurface: boolean}) {
    if (!geometry.length || geometry.length % 16 || !rays.length || rays.length % 8 || !geometry.every(Number.isFinite) || !rays.every(Number.isFinite)) throw new Error('Invalid diagnostic buffers');
    const attributeData=surface?.attributes??new Float32Array(geometry.length/16*20);
    if(attributeData.length!==geometry.length/16*20||!attributeData.every(Number.isFinite))throw new Error('Invalid surface attributes');
    const sphereCount=Array.from({length:geometry.length/16},(_,i)=>geometry[i*16+7]).filter(kind=>kind===0).length;
    const triangleTree=bvh && 'triangleIndices' in bvh ? bvh : null;
    const triangleCount=Array.from({length:geometry.length/16},(_,i)=>geometry[i*16+7]).filter(kind=>kind===2).length;
    // Both production trees share the same node/leaf layout and validator.
    const tree=triangleTree?packSphereBvh({nodes:triangleTree.nodes,sphereIndices:triangleTree.triangleIndices,stats:{...triangleTree.stats,sphereCount:triangleCount}},triangleCount):bvh?packSphereBvh(bvh as SphereBvh,sphereCount):{nodes:new Float32Array(8),indices:new Float32Array(1)};
    if(triangleTree)tree.nodes[2]=geometry.length/16-triangleCount;
    if (!navigator.gpu) throw new Error('WebGPU unavailable');
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) throw new Error('WebGPU adapter unavailable');
    const device = await adapter.requestDevice();
    const buffers: GPUBuffer[] = [];
    try {
        device.pushErrorScope('validation');
        const upload = (data: Float32Array) => {
            const buffer = device.createBuffer({size: data.byteLength, usage: GPUBufferUsage.STORAGE, mappedAtCreation: true});
            buffers.push(buffer); new Float32Array(buffer.getMappedRange()).set(data); buffer.unmap(); return buffer;
        };
        const primitives = upload(geometry), input = upload(rays);
        const nodes=upload(tree.nodes),indices=upload(tree.indices);
        const attributes=upload(attributeData);
        const output = device.createBuffer({size: rays.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC});
        const surfaceOutput=device.createBuffer({size:rays.byteLength,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC});
        const staging = device.createBuffer({size: rays.byteLength, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ});
        buffers.push(output, staging, surfaceOutput);
        const pipeline = await device.createComputePipelineAsync({layout:'auto',compute:{module:device.createShaderModule({code:source}),entryPoint:'main'}});
        const group = device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[primitives,input,output,nodes,indices,attributes,surfaceOutput].map((buffer,binding)=>({binding,resource:{buffer}}))});
        const encoder = device.createCommandEncoder();
        const pass = encoder.beginComputePass(); pass.setPipeline(pipeline); pass.setBindGroup(0,group); pass.dispatchWorkgroups(Math.ceil(rays.length/8/64)); pass.end();
        encoder.copyBufferToBuffer(surface?.readSurface?surfaceOutput:output,0,staging,0,rays.byteLength);
        device.queue.submit([encoder.finish()]);
        await staging.mapAsync(GPUMapMode.READ);
        const error = await device.popErrorScope();
        if(error) throw new Error(error.message);
        return staging.getMappedRange().slice(0);
    } finally {for(const buffer of buffers)buffer.destroy();device.destroy();}
}
