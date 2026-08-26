import * as THREE from "three";
import PtMaterial from "./PtMaterial.ts";
import { imageTexture } from "./PtTexture.ts";

/** Translate the core glTF metallic-roughness material into our semantic model. */
export function translateStaticGltfMaterial(material: THREE.Material): PtMaterial {
  if (!(material instanceof THREE.MeshStandardMaterial)) {
    throw new TypeError(`Unsupported glTF material type: ${material.type}`);
  }
  const baseColor = material.map
    ? {
        factor: material.color.clone(),
        texture: imageTexture(textureSource(material.map), 0xffffff, material.map),
        textureEnabled: true,
      }
    : material.color.clone();
  const metallicRoughnessMap = material.metalnessMap ?? material.roughnessMap;
  const emissionColor = material.emissiveMap
    ? {
        factor: material.emissive.clone(),
        texture: imageTexture(
          textureSource(material.emissiveMap),
          0xffffff,
          material.emissiveMap
        ),
        textureEnabled: true,
      }
    : material.emissive.clone();
  return PtMaterial.principledMetallicRoughness({
    baseColor,
    metallic: material.metalness,
    roughness: material.roughness,
    metallicRoughnessTexture: metallicRoughnessMap
      ? imageTexture(textureSource(metallicRoughnessMap), 0xffffff, metallicRoughnessMap)
      : undefined,
    ior: material instanceof THREE.MeshPhysicalMaterial ? material.ior : 1.5,
    emissionColor,
    emissionStrength: material.emissiveIntensity,
    emissionTwoSided: material.side === THREE.DoubleSide,
  });
}

function textureSource(texture: THREE.Texture): string {
  const image = texture.image as ({
    currentSrc?: string;
    src?: string;
    width?: number;
    height?: number;
  } & CanvasImageSource) | undefined;
  const source = image?.currentSrc || image?.src;
  if (source) return source;
  if (!image || typeof document === "undefined" || !image.width || !image.height) return "";
  try {
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext("2d");
    if (!context) return "";
    context.drawImage(image, 0, 0);
    return canvas.toDataURL("image/png");
  } catch {
    // The runtime texture still renders even when its decoded image cannot be
    // copied into a browser-preview URL (for example, a tainted remote image).
    return "";
  }
}
