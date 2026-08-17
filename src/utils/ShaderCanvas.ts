import * as THREE from "three";
import type PtUniforms from "../pathtracer/PtUniforms";

export class ShaderCanvas {
  private scene: THREE.Scene;
  private canvasCamera: THREE.OrthographicCamera;
  private material: THREE.ShaderMaterial;
  private clock = new THREE.Clock();
  private width: number;
  private height: number;
  private screenMaterial: THREE.MeshBasicMaterial;

  public screenScene: THREE.Scene;
  public screenCamera: THREE.OrthographicCamera;

  private resolutionScale: number;
  private pingRenderTarget: THREE.WebGLRenderTarget;
  private pongRenderTarget: THREE.WebGLRenderTarget;

  public readonly accumulationTextureType: THREE.TextureDataType;

  constructor({
    width,
    height,
    fragmentShader,
    vertexShader = `
      varying vec2 vNDC;

      void main() {
        vNDC = uv * 2.0 - 1.0;
        gl_Position = vec4(position, 1.0);
      }
    `,
    uniforms,
    renderer,
    resolutionScale = 1.0,
  }: {
    width: number;
    height: number;
    fragmentShader: string;
    vertexShader?: string;
    uniforms: PtUniforms;
    renderer: THREE.WebGLRenderer;
    resolutionScale?: number;
  }) {
    this.width = width;
    this.height = height;
    this.resolutionScale = resolutionScale;
    this.scene = new THREE.Scene();
    this.canvasCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const geometry = new THREE.PlaneGeometry(2, 2);
    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uResolution: {
          value: new THREE.Vector2(
            Math.floor(width * resolutionScale),
            Math.floor(height * resolutionScale)
          ),
        },
        uAccumTexture: { value: null },
        uFrameCount: { value: 0 },
        ...uniforms,
      },
    });

    const mesh = new THREE.Mesh(geometry, this.material);
    this.scene.add(mesh);

    this.accumulationTextureType = renderer.extensions.has(
      "EXT_color_buffer_float"
    )
      ? THREE.HalfFloatType
      : THREE.UnsignedByteType;

    if (this.accumulationTextureType === THREE.UnsignedByteType) {
      console.warn(
        "Floating-point color buffers are unavailable; path-tracing accumulation will use reduced-precision RGBA8 storage."
      );
    }

    this.pingRenderTarget = new THREE.WebGLRenderTarget(
      width * resolutionScale,
      height * resolutionScale,
      {
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
        format: THREE.RGBAFormat,
        type: this.accumulationTextureType,
        depthBuffer: false,
      }
    );
    this.pongRenderTarget = this.pingRenderTarget.clone();

    this.screenMaterial = new THREE.MeshBasicMaterial({
      map: this.pongRenderTarget.texture,
    });
    const screenQuad = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      this.screenMaterial
    );
    this.screenScene = new THREE.Scene();
    this.screenCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.screenScene.add(screenQuad);
  }

  public render(renderer: THREE.WebGLRenderer) {
    renderer.setRenderTarget(this.pongRenderTarget);

    this.material.uniforms.uTime.value = this.clock.getElapsedTime();
    this.material.uniforms.uFrameCount.value++;
    this.material.uniforms.uAccumTexture.value = this.pingRenderTarget.texture;

    renderer.render(this.scene, this.canvasCamera);
    renderer.setRenderTarget(null);
    this.screenMaterial.map = this.pongRenderTarget.texture;

    [this.pingRenderTarget, this.pongRenderTarget] = [
      this.pongRenderTarget,
      this.pingRenderTarget,
    ];
  }

  public setDimensions(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.updateRenderTargets();
  }

  public setResolutionScale(scale: number) {
    this.resolutionScale = scale;
    this.updateRenderTargets();
  }

  public setShader(fragmentShader: string) {
    this.material.fragmentShader = fragmentShader;
    this.resetAccumulation();
    this.material.needsUpdate = true;
  }

  public updateMaterial() {
    this.material.needsUpdate = true;
  }

  private updateRenderTargets() {
    const scaledW = this.width * this.resolutionScale;
    const scaledH = this.height * this.resolutionScale;

    this.material.uniforms.uResolution.value.set(
      Math.floor(scaledW),
      Math.floor(scaledH)
    );
    this.pingRenderTarget.setSize(scaledW, scaledH);
    this.pongRenderTarget.setSize(scaledW, scaledH);

    this.resetAccumulation();
  }

  public resetAccumulation() {
    this.material.uniforms.uFrameCount.value = 0;
  }
}
