/// <reference types="@webgpu/types" />
import computeSource from './spheres.wgsl?raw';
import presentSource from './present.wgsl?raw';
import {packCamera, type DemoCamera} from './camera.ts';

/** Isolated STE-197 learning fixture; does not replace the WebGL backend. */
export async function createSphereDemo(canvas: HTMLCanvasElement, onError: (message: string) => void) {
    if (!navigator.gpu) throw new Error('WebGPU is unavailable in this browser/context.');
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) throw new Error('No WebGPU adapter is available.');
    const device = await adapter.requestDevice();
    const context = canvas.getContext('webgpu');
    if (!context) { device.destroy(); throw new Error('WebGPU canvas initialization failed.'); }
    let disposed = false;
    let failed = false;
    const fail = (message: string) => { if (!disposed && !failed) { failed = true; onError(message); } };
    void device.lost.then(info => fail(`WebGPU device lost: ${info.reason}. Reload to retry. ${info.message}`));
    device.addEventListener('uncapturederror', event => fail(event.error.message));
    const format = navigator.gpu.getPreferredCanvasFormat();
    let accumulation: GPUBuffer | undefined;
    const uniform = device.createBuffer({ size: 80, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    try {
        device.pushErrorScope('validation');
        const compute = await device.createComputePipelineAsync({ layout: 'auto', compute: { module: device.createShaderModule({code: computeSource}), entryPoint: 'main' } });
        const present = await device.createRenderPipelineAsync({ layout: 'auto', vertex: {module: device.createShaderModule({code: presentSource}), entryPoint: 'vertexMain'}, fragment: {module: device.createShaderModule({code: presentSource}), entryPoint: 'fragmentMain', targets: [{format}]}, primitive: {topology: 'triangle-list'} });
        const error = await device.popErrorScope();
        if (error) throw new Error(error.message);
        let computeGroup: GPUBindGroup;
        let presentGroup: GPUBindGroup;
        let samples = 0;
        let seed = 12345;
        let generation = 0;
        let inFlight = false;
        let width = 0;
        let height = 0;
        let camera = packCamera({position: [0, 0.3, 2], target: [0, 0.3, -1], fov: 45});
        const resize = (w: number, h: number) => {
            if (disposed || failed) return;
            if (!Number.isSafeInteger(w) || !Number.isSafeInteger(h) || w < 1 || h < 1) throw new Error('Invalid render dimensions.');
            if (w > device.limits.maxTextureDimension2D || h > device.limits.maxTextureDimension2D || w * h * 16 > Math.min(device.limits.maxStorageBufferBindingSize, device.limits.maxBufferSize)) throw new Error('Render dimensions exceed WebGPU device limits.');
            if (w === width && h === height) return;
            accumulation?.destroy();
            width = w; height = h; samples = 0; generation++;
            canvas.width = w; canvas.height = h;
            context.configure({device, format, alphaMode: 'opaque'});
            accumulation = device.createBuffer({size: w * h * 16, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC});
            const entries = [{binding: 0, resource: {buffer: uniform}}, {binding: 1, resource: {buffer: accumulation}}];
            computeGroup = device.createBindGroup({layout: compute.getBindGroupLayout(0), entries});
            presentGroup = device.createBindGroup({layout: present.getBindGroupLayout(0), entries});
        };
        resize(640, 480);
        return {
            device, resize,
            get samples() { return samples; },
            reset() { samples = 0; generation++; },
            setSeed(value: number) {
                if (!Number.isSafeInteger(value) || value < 0 || value > 0xffffffff) throw new Error('Seed must be a uint32.');
                if (value === seed) return;
                seed = value; samples = 0; generation++;
            },
            setCamera(value: DemoCamera) {
                const next = packCamera(value);
                if (next.every((value, index) => value === camera[index])) return;
                camera = next; samples = 0; generation++;
            },
            /** Diagnostic linear RGBA readback. Call after awaiting frame(). */
            async readback() {
                if (disposed || failed || inFlight || samples === 0) throw new Error('Readback requires an idle, valid accumulated frame.');
                const capturedGeneration = generation;
                const bytes = width * height * 16;
                const staging = device.createBuffer({size: bytes, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ});
                try {
                    const encoder = device.createCommandEncoder();
                    encoder.copyBufferToBuffer(accumulation!, 0, staging, 0, bytes);
                    device.queue.submit([encoder.finish()]);
                    await staging.mapAsync(GPUMapMode.READ);
                    if (disposed || failed || capturedGeneration !== generation) throw new Error('Capture invalidated during readback.');
                    return new Float32Array(staging.getMappedRange().slice(0));
                } finally { staging.destroy(); }
            },
            async frame() {
                if (disposed || failed || inFlight) return;
                inFlight = true;
                const submittedGeneration = generation;
                try {
                device.queue.writeBuffer(uniform, 0, new Uint32Array([width, height, samples, seed]));
                device.queue.writeBuffer(uniform, 16, camera);
                const encoder = device.createCommandEncoder();
                const pass = encoder.beginComputePass();
                pass.setPipeline(compute); pass.setBindGroup(0, computeGroup);
                pass.dispatchWorkgroups(Math.ceil(width / 8), Math.ceil(height / 8)); pass.end();
                const display = encoder.beginRenderPass({colorAttachments: [{view: context.getCurrentTexture().createView(), loadOp: 'clear', storeOp: 'store', clearValue: {r: 0, g: 0, b: 0, a: 1}}]});
                display.setPipeline(present); display.setBindGroup(0, presentGroup); display.draw(3); display.end();
                device.queue.submit([encoder.finish()]);
                await device.queue.onSubmittedWorkDone(); // Keep at most one frame in flight in this learning demo.
                if (!disposed && !failed && generation === submittedGeneration) samples++;
                } finally { inFlight = false; }
            },
            dispose() { if (disposed) return; disposed = true; accumulation?.destroy(); uniform.destroy(); context.unconfigure(); device.destroy(); },
        };
    } catch (error) { disposed = true; accumulation?.destroy(); uniform.destroy(); context.unconfigure(); device.destroy(); throw error; }
}
