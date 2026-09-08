/// <reference types="@webgpu/types" />
import intersections from './intersections.wgsl?raw';
import preview from './preview.wgsl?raw';
import {packCamera,type DemoCamera} from './camera';
import {packAnalyticGeometry,packSurfaceAttributes} from './geometry';
import {packSphereBvh} from './sphereBvh';
import {PresetPtScenes} from '../pathtracer/PresetPtScenes';
import SceneCompiler from '../pathtracer/SceneCompiler';
import {Mesh} from 'three';

/** GPU-only primary-hit preview; no per-frame CPU readback or transport shading. */
export async function createGeometryPreview(canvas:HTMLCanvasElement,onError:(message:string)=>void) {
    if(!navigator.gpu)throw new Error('WebGPU unavailable');
    const adapter=await navigator.gpu.requestAdapter();if(!adapter)throw new Error('WebGPU adapter unavailable');
    const device=await adapter.requestDevice();
    const context=canvas.getContext('webgpu');if(!context){device.destroy();throw new Error('WebGPU canvas unavailable');}
    let disposed=false,failed=false,busy=false,frames=0,mode=0;
    const fail=(message:string)=>{if(!disposed&&!failed){failed=true;onError(message);}};
    void device.lost.then(info=>fail(`WebGPU device lost: ${info.message}`));
    device.addEventListener('uncapturederror',event=>fail(event.error.message));
    const buffers:GPUBuffer[]=[];
    const targets:GPUBuffer[]=[];
    const scene=PresetPtScenes.PackedTrianglesStudy();
    const compiled=new SceneCompiler().compile(scene);
    const destroy=()=>{if(disposed)return;disposed=true;targets.forEach(b=>b.destroy());buffers.forEach(b=>b.destroy());context.unconfigure();device.destroy();compiled.dispose();scene.scene.traverse(o=>{if(o instanceof Mesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();}});scene.rasterGradientEnvironmentTexture?.dispose();};
    try {
        const subset={spheres:[],quads:[],boxes:[],triangles:compiled.triangles};
        const tree=packSphereBvh({nodes:compiled.triangleBvh.nodes,sphereIndices:compiled.triangleBvh.triangleIndices,stats:{...compiled.triangleBvh.stats,sphereCount:compiled.triangles.length}},compiled.triangles.length);
        const upload=(data:Float32Array)=>{const b=device.createBuffer({size:data.byteLength,usage:GPUBufferUsage.STORAGE,mappedAtCreation:true});buffers.push(b);new Float32Array(b.getMappedRange()).set(data);b.unmap();return b;};
        const geometry=upload(packAnalyticGeometry(subset)),nodes=upload(tree.nodes),indices=upload(tree.indices),attributes=upload(packSurfaceAttributes(subset));
        const uniform=device.createBuffer({size:80,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});buffers.push(uniform);
        device.pushErrorScope('validation');
        const module=device.createShaderModule({code:intersections+'\n'+preview});
        const generate=await device.createComputePipelineAsync({layout:'auto',compute:{module,entryPoint:'generateRays'}});
        const trace=await device.createComputePipelineAsync({layout:'auto',compute:{module,entryPoint:'main'}});
        const format=navigator.gpu.getPreferredCanvasFormat();
        const display=await device.createRenderPipelineAsync({layout:'auto',vertex:{module,entryPoint:'previewVertex'},fragment:{module,entryPoint:'previewFragment',targets:[{format}]}});
        const error=await device.popErrorScope();if(error)throw new Error(error.message);
        let camera=packCamera({position:[4.8,3.5,5.8],target:[0,-0.3,-0.7],fov:43});
        let width=0,height=0;
        let generateGroup:GPUBindGroup,traceGroup:GPUBindGroup,displayGroup:GPUBindGroup;
        const resize=(w:number,h:number)=>{
            if(disposed||failed)return;
            if(!Number.isSafeInteger(w)||!Number.isSafeInteger(h)||w<1||h<1||w>device.limits.maxTextureDimension2D||h>device.limits.maxTextureDimension2D||w*h*32>Math.min(device.limits.maxBufferSize,device.limits.maxStorageBufferBindingSize)||Math.ceil(w*h/64)>device.limits.maxComputeWorkgroupsPerDimension)throw new Error('Invalid preview dimensions');
            if(w===width&&h===height)return;
            targets.splice(0).forEach(b=>b.destroy());width=w;height=h;canvas.width=w;canvas.height=h;
            context.configure({device,format,alphaMode:'opaque'});
            const create=()=>{const b=device.createBuffer({size:w*h*32,usage:GPUBufferUsage.STORAGE});targets.push(b);return b;};
            const rays=create(),hits=create(),surface=create();
            const entry=(binding:number,buffer:GPUBuffer)=>({binding,resource:{buffer}});
            generateGroup=device.createBindGroup({layout:generate.getBindGroupLayout(0),entries:[entry(1,rays),entry(7,uniform)]});
            traceGroup=device.createBindGroup({layout:trace.getBindGroupLayout(0),entries:[geometry,rays,hits,nodes,indices,attributes,surface].map((b,i)=>entry(i,b))});
            displayGroup=device.createBindGroup({layout:display.getBindGroupLayout(0),entries:[entry(2,hits),entry(6,surface),entry(7,uniform)]});
        };
        resize(640,480);
        return {resize,dispose:destroy,reset(){frames=0;},get samples(){return frames;},setMode(value:number){if(![0,1,2].includes(value))throw new Error('Invalid preview mode');mode=value;},setCamera(value:DemoCamera){camera=packCamera(value);},async frame(){
            if(disposed||failed||busy)return;busy=true;
            try {
                device.queue.writeBuffer(uniform,0,new Uint32Array([width,height,0,mode]));device.queue.writeBuffer(uniform,16,camera);
                const encoder=device.createCommandEncoder();
                const a=encoder.beginComputePass();a.setPipeline(generate);a.setBindGroup(0,generateGroup);a.dispatchWorkgroups(Math.ceil(width/8),Math.ceil(height/8));a.end();
                const b=encoder.beginComputePass();b.setPipeline(trace);b.setBindGroup(0,traceGroup);b.dispatchWorkgroups(Math.ceil(width*height/64));b.end();
                const c=encoder.beginRenderPass({colorAttachments:[{view:context.getCurrentTexture().createView(),loadOp:'clear',storeOp:'store'}]});c.setPipeline(display);c.setBindGroup(0,displayGroup);c.draw(3);c.end();
                device.queue.submit([encoder.finish()]);await device.queue.onSubmittedWorkDone();if(!disposed&&!failed)frames++;
            }finally{busy=false;}
        }};
    }catch(error){destroy();throw error;}
}
