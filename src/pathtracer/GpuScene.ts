import type * as THREE from "three";
import type PtMaterial from "./PtMaterial";
import type { TriangleBvh } from "./TriangleBvh";
import type { SphereBvh } from "./SphereBvh";

export interface GpuSphere {
  position: THREE.Vector3;
  radius: number;
  materialId: number;
  uvMapping: number;
}

export interface GpuQuad {
  q: THREE.Vector3;
  u: THREE.Vector3;
  v: THREE.Vector3;
  normal: THREE.Vector3;
  materialId: number;
}

export interface GpuBox {
  center: THREE.Vector3;
  halfSize: THREE.Vector3;
  axisX: THREE.Vector3;
  axisY: THREE.Vector3;
  axisZ: THREE.Vector3;
  materialId: number;
}

export interface GpuTriangle {
  a: THREE.Vector3;
  b: THREE.Vector3;
  c: THREE.Vector3;
  normalA: THREE.Vector3;
  normalB: THREE.Vector3;
  normalC: THREE.Vector3;
  uvA: THREE.Vector2;
  uvB: THREE.Vector2;
  uvC: THREE.Vector2;
  materialId: number;
}

export enum GpuTextureType {
  Constant = 0,
  Checker = 1,
  Image = 2,
  Perlin = 3,
}

export interface GpuTexture {
  type: GpuTextureType;
  colorA: THREE.Color;
  colorB: THREE.Color;
  scale: number;
  turbulence: number;
  imageId: number;
}

export interface GpuMaterial {
  model: PtMaterial["type"];
  baseColorTextureId: number;
  emissionTextureId: number;
  metallicRoughnessTextureId: number;
  transmissionTextureId: number;
  thicknessTextureId: number;
  textureEnableMask: number;
  baseColorFactor: THREE.Color;
  emissionFactor: THREE.Color;
  roughness: number;
  metallic: number;
  ior: number;
  transmission: number;
  thickness: number;
  attenuationColor: THREE.Color;
  attenuationDistance: number;
  dispersion: number;
  emissionStrength: number;
  emissionTwoSided: boolean;
}

export interface GpuLight {
  kind: 0 | 1 | 2 | 3 | 4;
  primitiveType: 0 | 1;
  primitiveIndex: number;
  materialId: number;
  area: number;
  emissionTwoSided: boolean;
  position: THREE.Vector3;
  direction: THREE.Vector3;
  color: THREE.Color;
  intensity: number;
  angularDiameter: number;
  innerConeCos: number;
  outerConeCos: number;
}

export default class GpuScene {
  public spheres: GpuSphere[];
  public sphereBvh: SphereBvh;
  public quads: GpuQuad[];
  public boxes: GpuBox[];
  public triangles: GpuTriangle[];
  public triangleBvh: TriangleBvh;
  public materials: GpuMaterial[];
  public textures: GpuTexture[];
  public imageTextures: THREE.Texture[];
  public lights: GpuLight[];
  private disposed = false;

  constructor(
    spheres: GpuSphere[],
    sphereBvh: SphereBvh,
    quads: GpuQuad[],
    boxes: GpuBox[],
    triangles: GpuTriangle[],
    triangleBvh: TriangleBvh,
    materials: GpuMaterial[],
    textures: GpuTexture[],
    imageTextures: THREE.Texture[],
    lights: GpuLight[]
  ) {
    this.spheres = spheres;
    this.sphereBvh = sphereBvh;
    this.quads = quads;
    this.boxes = boxes;
    this.triangles = triangles;
    this.triangleBvh = triangleBvh;
    this.materials = materials;
    this.textures = textures;
    this.imageTextures = imageTextures;
    this.lights = lights;
  }

  public updateSpheres(spheres: GpuSphere[], sphereBvh: SphereBvh) {
    this.assertUsable();
    this.spheres = spheres;
    this.sphereBvh = sphereBvh;
  }

  public updateQuads(quads: GpuQuad[]) {
    this.assertUsable();
    this.quads = quads;
  }

  public updateBoxes(boxes: GpuBox[]) {
    this.assertUsable();
    this.boxes = boxes;
  }

  public updateTriangles(triangles: GpuTriangle[], triangleBvh: TriangleBvh) {
    this.assertUsable();
    this.triangles = triangles;
    this.triangleBvh = triangleBvh;
  }

  public updateMaterials(
    materials: GpuMaterial[],
    textures: GpuTexture[],
    imageTextures: THREE.Texture[]
  ) {
    this.assertUsable();
    this.materials = materials;
    this.textures = textures;
    this.imageTextures = imageTextures;
  }

  public updateLights(lights: GpuLight[]) {
    this.assertUsable();
    this.lights = lights;
  }

  public dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.spheres = [];
    this.sphereBvh = { nodes: [], sphereIndices: [], stats: { sphereCount: 0, nodeCount: 0, leafCount: 0, maxDepth: 0, maxLeafSize: 0 } };
    this.quads = [];
    this.boxes = [];
    this.triangles = [];
    this.triangleBvh = { nodes: [], triangleIndices: [], stats: { triangleCount: 0, nodeCount: 0, leafCount: 0, maxDepth: 0, maxLeafSize: 0 } };
    this.materials = [];
    this.textures = [];
    this.imageTextures = [];
    this.lights = [];
  }

  private assertUsable() {
    if (this.disposed) throw new Error("GpuScene has been disposed");
  }
}
