import test from 'node:test';
import assert from 'node:assert/strict';
import {packCamera} from '../src/webgpu/camera.ts';

test('WebGPU camera packs aligned origin and orthonormal basis', () => {
    const p = packCamera({position: [0, 0.3, 2], target: [0, 0.3, -1], fov: 90});
    assert.equal(p.length, 16);
    assert.equal(p[6], -1);
    assert.equal(p[8], 1);
    assert.equal(p[13], 1);
    assert.ok(Math.abs(p[7] - 1) < 1e-6);
    const q = packCamera({position: [3, 4, 5], target: [0, 0, 0], fov: 45});
    const axes = [Array.from(q.slice(4, 7)), Array.from(q.slice(8, 11)), Array.from(q.slice(12, 15))];
    for (const a of axes) assert.ok(Math.abs(Math.hypot(...a) - 1) < 1e-6);
    for (let i=0;i<3;i++) for(let j=i+1;j<3;j++) assert.ok(Math.abs(axes[i].reduce((s,v,k)=>s+v*axes[j][k],0)) < 1e-6);
});
test('WebGPU camera rejects singular and non-finite input', () => {
    for (const target of [[0,0,0], [0,1,0], [NaN,0,0]] as [number,number,number][]) {
        assert.throws(() => packCamera({position:[0,0,0], target, fov:45}));
    }
    assert.throws(() => packCamera({position:[0,0,1], target:[0,0,0], fov:180}));
});
