export interface DemoCamera { position: [number, number, number]; target: [number, number, number]; fov: number }

/** World-up +Y basis, packed as four aligned vec4s for WGSL uniforms. */
export function packCamera({position, target, fov}: DemoCamera): Float32Array<ArrayBuffer> {
    if (![...position, ...target, fov].every(Number.isFinite) || fov <= 0 || fov >= 179) throw new Error('Invalid camera values.');
    const forward = target.map((v, i) => v - position[i]);
    const length = Math.hypot(...forward);
    if (length < 1e-8) throw new Error('Camera position and target must differ.');
    for (let i = 0; i < 3; i++) forward[i] /= length;
    const horizontal = Math.hypot(forward[0], forward[2]);
    if (horizontal < 1e-6) throw new Error('Camera cannot point exactly along world up.');
    const right = [-forward[2] / horizontal, 0, forward[0] / horizontal];
    const up = [right[1] * forward[2] - right[2] * forward[1], right[2] * forward[0] - right[0] * forward[2], right[0] * forward[1] - right[1] * forward[0]];
    return new Float32Array([...position, 0, ...forward, Math.tan(fov * Math.PI / 360), ...right, 0, ...up, 0]);
}
