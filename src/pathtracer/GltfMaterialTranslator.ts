import * as THREE from "three";
import PtMaterial from "./PtMaterial";
import { imageTexture } from "./PtTexture";

/** Translate the currently supported portion of a core glTF PBR material.
 *
 * Base-color images are preserved, but continuous dielectric/metallic response
 * and combined scattering/emission require the material-system migration. This
 * checkpoint deliberately keeps that approximation explicit.
 */
export function translateStaticGltfMaterial(material: THREE.Material): PtMaterial {
  if (!(material instanceof THREE.MeshStandardMaterial)) {
    throw new TypeError(`Unsupported glTF material type: ${material.type}`);
  }
  const emission = material.emissive;
  if (
    !material.map &&
    Math.max(emission.r, emission.g, emission.b) > 0 &&
    material.emissiveIntensity > 0
  ) {
    return PtMaterial.emissive(
      material.emissiveMap
        ? imageTexture(textureSource(material.emissiveMap), emission, material.emissiveMap)
        : emission.clone(),
      material.emissiveIntensity,
      material.side === THREE.DoubleSide
    );
  }
  const albedo = material.map
    ? imageTexture(textureSource(material.map), material.color, material.map)
    : material.color.clone();
  if (material.metalness >= 0.5) {
    return PtMaterial.legacyFuzzyMetal(albedo, material.roughness);
  }
  return PtMaterial.legacyLambert(albedo);
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
