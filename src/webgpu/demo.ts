import {createSphereDemo} from './SphereDemo';
import {PerspectiveCamera} from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
const canvas = document.querySelector('canvas')!;
const status = document.querySelector('output')!;
let stopped = false;
const geometryMode=new URLSearchParams(location.search).has('geometry');
try {
    const factory=geometryMode?(await import('./GeometryPreview')).createGeometryPreview:createSphereDemo;
    const demo = await factory(canvas, message => { stopped = true; status.textContent = message; });
    const camera = new PerspectiveCamera(45, 4 / 3, 0.01, 1000);
    camera.position.set(...(geometryMode?[4.8,3.5,5.8]:[0,0.3,2]) as [number,number,number]);
    camera.fov=geometryMode?43:45;
    const controls = new OrbitControls(camera, canvas);
    controls.target.set(...(geometryMode?[0,-0.3,-0.7]:[0,0.3,-1]) as [number,number,number]);
    controls.minDistance = 0.6;
    controls.maxDistance = 30;
    controls.minPolarAngle = 0.05;
    controls.maxPolarAngle = Math.PI - 0.05;
    controls.enableDamping = false;
    controls.update();
    controls.addEventListener('change', () => demo.setCamera({position: camera.position.toArray(), target: controls.target.toArray(), fov: camera.fov}));
    let large = false;
    if(geometryMode)document.querySelector('#reset')!.textContent='Reset frame counter';
    const modes=document.querySelector<HTMLSelectElement>('#mode')!;
    modes.hidden=!geometryMode;
    modes.addEventListener('change',()=>{if('setMode' in demo)demo.setMode(Number(modes.value));});
    document.querySelector('#description')!.textContent=geometryMode?'Packed scene triangle subset · primary-hit diagnostics only, not path-traced shading.':'Experimental diffuse-sphere fixture. Not yet production-scene parity.';
    document.querySelector('#reset')!.addEventListener('click', () => demo.reset());
    document.querySelector('#resize')!.addEventListener('click', () => { large = !large; demo.resize(large ? 800 : 640, large ? 600 : 480); });
    window.addEventListener('pagehide', () => { stopped = true; controls.dispose(); demo.dispose(); }, {once: true});
    const tick = async () => {
        if (stopped) return;
        try { await demo.frame(); } catch (error) { stopped = true; status.textContent = String(error); demo.dispose(); return; }
        if (!stopped) { status.textContent = `${demo.samples} ${geometryMode?'frames':'samples'} · ${canvas.width} × ${canvas.height}`; requestAnimationFrame(tick); }
    };
    void tick();
} catch (error) { status.textContent = String(error); }
