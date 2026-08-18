import * as THREE from "three";
import type PtUniforms from "../pathtracer/PtUniforms";
import type { AccumulationFormat } from "../pathtracer/PtState";

const RANDOM_SEQUENCE_MODULUS_X = 65_521;
const RANDOM_SEQUENCE_MODULUS_Y = 65_519;

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
  private randomSequenceIndex = 0;
  private readonly floatColorBufferSupported: boolean;
  private maxAccumulationFrames: number;

  public accumulationTextureType: THREE.TextureDataType;

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
    accumulationFormat = "rgba32f",
    maxAccumulationFrames = 0,
  }: {
    width: number;
    height: number;
    fragmentShader: string;
    vertexShader?: string;
    uniforms: PtUniforms;
    renderer: THREE.WebGLRenderer;
    resolutionScale?: number;
    accumulationFormat?: AccumulationFormat;
    maxAccumulationFrames?: number;
  }) {
    this.width = width;
    this.height = height;
    this.resolutionScale = resolutionScale;
    this.maxAccumulationFrames = maxAccumulationFrames;
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
        uRandomSequence: { value: new THREE.Vector2(0, 0) },
        ...uniforms,
      },
    });

    const mesh = new THREE.Mesh(geometry, this.material);
    this.scene.add(mesh);

    this.floatColorBufferSupported = renderer.extensions.has(
      "EXT_color_buffer_float"
    );
    this.accumulationTextureType =
      this.resolveAccumulationTextureType(accumulationFormat);

    this.pingRenderTarget = this.createRenderTarget();
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
    if (
      this.maxAccumulationFrames > 0 &&
      this.material.uniforms.uFrameCount.value >= this.maxAccumulationFrames
    ) {
      return;
    }

    renderer.setRenderTarget(this.pongRenderTarget);

    this.material.uniforms.uTime.value = this.clock.getElapsedTime();
    this.material.uniforms.uFrameCount.value++;
    this.randomSequenceIndex++;
    this.updateRandomSequenceUniform();
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

  public setAccumulationFormat(format: AccumulationFormat) {
    const textureType = this.resolveAccumulationTextureType(format);
    if (textureType === this.accumulationTextureType) return;

    this.accumulationTextureType = textureType;
    this.pingRenderTarget.dispose();
    this.pongRenderTarget.dispose();

    this.pingRenderTarget = this.createRenderTarget();
    this.pongRenderTarget = this.pingRenderTarget.clone();
    this.screenMaterial.map = this.pongRenderTarget.texture;
    this.resetAccumulation();
  }

  public setMaxAccumulationFrames(maxFrames: number) {
    if (!Number.isSafeInteger(maxFrames) || maxFrames < 0) {
      throw new RangeError(
        "Maximum accumulation frames must be a non-negative safe integer."
      );
    }

    this.maxAccumulationFrames = maxFrames;
    this.resetAccumulation();
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
    this.setRandomSequenceIndex(0);
  }

  /** Sets completed sample batches; the next render advances to the following index. */
  public setRandomSequenceIndex(index: number) {
    if (!Number.isSafeInteger(index) || index < 0) {
      throw new RangeError("Random sequence index must be a non-negative safe integer.");
    }

    this.randomSequenceIndex = index;
    this.updateRandomSequenceUniform();
  }

  public dispose() {
    this.pingRenderTarget.dispose();
    this.pongRenderTarget.dispose();

    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh) object.geometry.dispose();
    });
    this.screenScene.traverse((object) => {
      if (object instanceof THREE.Mesh) object.geometry.dispose();
    });

    this.material.dispose();
    this.screenMaterial.dispose();
  }

  private updateRandomSequenceUniform() {
    this.material.uniforms.uRandomSequence.value.set(
      this.randomSequenceIndex % RANDOM_SEQUENCE_MODULUS_X,
      this.randomSequenceIndex % RANDOM_SEQUENCE_MODULUS_Y
    );
  }

  private resolveAccumulationTextureType(
    format: AccumulationFormat
  ): THREE.TextureDataType {
    if (format === "rgba8") return THREE.UnsignedByteType;

    if (!this.floatColorBufferSupported) {
      console.warn(
        `Floating-point color buffers are unavailable; ${format} accumulation will fall back to rgba8.`
      );
      return THREE.UnsignedByteType;
    }

    return format === "rgba32f" ? THREE.FloatType : THREE.HalfFloatType;
  }

  private createRenderTarget() {
    return new THREE.WebGLRenderTarget(
      this.width * this.resolutionScale,
      this.height * this.resolutionScale,
      {
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
        format: THREE.RGBAFormat,
        type: this.accumulationTextureType,
        depthBuffer: false,
      }
    );
  }
}
