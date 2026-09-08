// Requires an isolated Chrome CDP endpoint and Vite. Never touches existing tabs.
const endpoint = process.env.PARITY_CDP_URL ?? 'http://127.0.0.1:19687';
const base = process.env.WEBGPU_APP_URL ?? 'http://127.0.0.1:3019/pathtracer-lab/';
const convergence = process.argv.includes('--convergence');
const geometry = process.argv.includes('--geometry');
const response = await fetch(`${endpoint}/json/new?about:blank`, {method:'PUT'});
if (!response.ok) throw new Error('Cannot create diagnostic tab');
const page = await response.json();
const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve,reject) => {socket.onopen=resolve; socket.onerror=reject;});
let sequence=0;
const pending=new Map();
socket.onmessage=event=>{const message=JSON.parse(event.data);pending.get(message.id)?.(message);};
function call(method,params={}) {
    return new Promise((resolve,reject)=>{
        const id=++sequence;
        const timeout=setTimeout(()=>{pending.delete(id);reject(new Error(`Timeout: ${method}`));},convergence ? 240000 : 60000);
        pending.set(id,message=>{clearTimeout(timeout);pending.delete(id);message.error?reject(new Error(JSON.stringify(message.error))):resolve(message.result);});
        socket.send(JSON.stringify({id,method,params}));
    });
}
try {
    await call('Page.enable');
    await call('Page.navigate',{url:new URL('README.md',base).href});
    await new Promise(resolve=>setTimeout(resolve,1000));
    const result=await call('Runtime.evaluate',{awaitPromise:true,returnByValue:true,expression:`(async()=>{
        document.body.innerHTML='';
        const {createSphereDemo}=await import(${JSON.stringify(new URL('src/webgpu/SphereDemo.ts',base).href)});
        const canvas=document.createElement('canvas');document.body.append(canvas);
        const errors=[];const demo=await createSphereDemo(canvas,message=>errors.push(message));
        const check=(condition,message)=>{if(!condition)throw Error(message);};
        const equal=(a,b)=>a.length===b.length&&a.every((value,i)=>value===b[i]);
        const validate=data=>{
            check(data.every(Number.isFinite),'Non-finite output');
            check(data.some((v,i)=>i%4!==3&&v>0),'Black output');
            check(data.every((v,i)=>i%4!==3||v===1),'Unwritten pixel');
        };
        try {
            demo.resize(65,49);
            await demo.frame(); const first=await demo.readback();validate(first);
            check(first.length===65*49*4,'Readback dimensions');
            for(let i=0;i<15;i++)await demo.frame();const accumulated=await demo.readback();validate(accumulated);
            check(!equal(first,accumulated),'Accumulation did not change');
            demo.reset();await demo.frame();check(equal(first,await demo.readback()),'Reset not repeatable');
            const inFlight=demo.frame();demo.reset();await inFlight;check(demo.samples===0,'Reset race');
            await demo.frame();check(equal(first,await demo.readback()),'In-flight reset left old radiance');
            demo.setCamera({position:[1,0.5,2],target:[0,0.3,-1],fov:45});
            check(demo.samples===0,'Camera did not reset');await demo.frame();
            const moved=await demo.readback();validate(moved);check(!equal(first,moved),'Camera had no effect');
            demo.setCamera({position:[0,0.3,2],target:[0,0.3,-1],fov:45});await demo.frame();
            check(equal(first,await demo.readback()),'Camera restore not repeatable');
            demo.resize(32,24);await demo.frame();check((await demo.readback()).length===32*24*4,'Resize readback');
            let convergenceReport = null;
            if (${convergence}) {
                const {compareLinearFrames}=await import(${JSON.stringify(new URL('src/pathtracer/ParityMetrics.ts',base).href)});
                demo.resize(64,48);
                const capture=async(seed,samples)=>{
                    demo.setSeed(seed);demo.reset();
                    for(let i=0;i<samples;i++)await demo.frame();
                    const frame=await demo.readback();validate(frame);return frame;
                };
                const reference=await capture(987654321,1024);
                // A second budget checkpoint measures reference drift; neither
                // different seeds nor this test certify statistical independence.
                for(let i=0;i<1024;i++)await demo.frame();
                const doubled=await demo.readback();validate(doubled);
                const checkpoints=[];
                for(const samples of [16,64,256]) {
                    const runs=[];
                    for(const seed of [12345,67890]) {
                        const frame=await capture(seed,samples);
                        runs.push({seed,...compareLinearFrames(doubled,frame)});
                    }
                    checkpoints.push({samples,runs,meanNrmse:runs.reduce((sum,run)=>sum+run.nrmse,0)/runs.length});
                }
                check(checkpoints[2].meanNrmse < checkpoints[0].meanNrmse,'Higher sample count did not reduce aggregate error');
                convergenceReport={width:64,height:48,referenceSeed:987654321,referenceSamples:2048,referenceBudgetDrift:compareLinearFrames(doubled,reference),checkpoints,qualification:'Exploratory same-integrator regression, not independent-stream certification or WebGL parity'};
            }
            check(errors.length===0,'GPU errors: '+errors.join(';'));
            let geometryReport = null;
            if (${geometry}) {
                const {verifyIntersections}=await import(${JSON.stringify(new URL('src/webgpu/verifyIntersections.ts',base).href)});
                geometryReport=await verifyIntersections();
                const {verifyTriangles}=await import(${JSON.stringify(new URL('src/webgpu/verifyTriangles.ts',base).href)});
                geometryReport.triangles=await verifyTriangles();
                const {verifySurface}=await import(${JSON.stringify(new URL('src/webgpu/verifySurface.ts',base).href)});
                geometryReport.surface=await verifySurface();
                const {createGeometryPreview}=await import(${JSON.stringify(new URL('src/webgpu/GeometryPreview.ts',base).href)});
                const previewCanvas=document.createElement('canvas');document.body.append(previewCanvas);
                const previewErrors=[];
                const preview=await createGeometryPreview(previewCanvas,e=>previewErrors.push(e));
                try {
                    preview.resize(65,49);
                    for(const mode of [0,1,2]){preview.setMode(mode);await preview.frame();}
                    preview.setCamera({position:[3,4,5],target:[0,0,0],fov:43});await preview.frame();
                    check(preview.samples===4&&previewErrors.length===0,'Preview rendering failed: '+previewErrors.join(';'));
                    geometryReport.preview={modes:3,camera:true,partialWorkgroups:true};
                }finally{preview.dispose();previewCanvas.remove();}
            }
            demo.device.destroy();await new Promise(resolve=>setTimeout(resolve,100));
            check(errors.some(e=>e.includes('device lost')),'Missing device loss notification');
            return {finite:true,allPixelsWritten:true,accumulation:true,resetRepeatability:true,inFlightReset:true,camera:true,resize:true,deviceLoss:true,convergence:convergenceReport,geometry:geometryReport,kind:'diagnostic, not certified convergence or backend parity'};
        } finally {demo.dispose();canvas.remove();}
    })()`});
    if(result.exceptionDetails)throw new Error(JSON.stringify(result.exceptionDetails));
    console.log(JSON.stringify(result.result.value,null,2));
} finally {
    await fetch(`${endpoint}/json/close/${page.id}`).catch(()=>{});
    socket.close();
}
