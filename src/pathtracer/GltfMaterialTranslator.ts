import * as THREE from "three";
import PtMaterial from "./PtMaterial.ts";
import { imageTexture } from "./PtTexture.ts";

/** Translate the core glTF metallic-roughness material into our semantic model. */
export function translateStaticGltfMaterial(material: THREE.Material): PtMaterial {
  if (!(material instanceof THREE.MeshStandardMaterial)) {
    throw new TypeError(`Unsupported glTF material type: ${material.type}`);
  }
  validateTexture(material.map, "base color");
  validateTexture(material.metalnessMap, "metallic-roughness");
  validateTexture(material.roughnessMap, "metallic-roughness");
  validateTexture(material.emissiveMap, "emission");
  if (material instanceof THREE.MeshPhysicalMaterial) {
    validateTexture(material.transmissionMap, "transmission");
    validateTexture(material.thicknessMap, "volume thickness");
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
  const physical = material instanceof THREE.MeshPhysicalMaterial ? material : null;
  return PtMaterial.principledMetallicRoughness({
    baseColor,
    metallic: material.metalness,
    roughness: material.roughness,
    metallicRoughnessTexture: metallicRoughnessMap
      ? imageTexture(textureSource(metallicRoughnessMap), 0xffffff, metallicRoughnessMap)
      : undefined,
    ior: physical?.ior ?? 1.5,
    transmission: physical?.transmission ?? 0,
    transmissionTexture: physical?.transmissionMap
      ? imageTexture(textureSource(physical.transmissionMap), 0xffffff, physical.transmissionMap)
      : undefined,
    thickness: physical?.thickness ?? 0,
    thicknessTexture: physical?.thicknessMap
      ? imageTexture(textureSource(physical.thicknessMap), 0xffffff, physical.thicknessMap)
      : undefined,
    attenuationColor: physical?.attenuationColor,
    attenuationDistance: physical?.attenuationDistance,
    dispersion: physical?.dispersion ?? 0,
    emissionColor,
    emissionStrength: material.emissiveIntensity,
    emissionTwoSided: material.side === THREE.DoubleSide,
  });
}

function validateTexture(texture: THREE.Texture | null, semantic: string) {
  if (!texture) return;
  if (texture.channel !== 0) {
    throw new Error(
      `Unsupported ${semantic} texture UV set: TEXCOORD_${texture.channel}. ` +
      "The static glTF path currently supports TEXCOORD_0 only."
    );
  }
  if (texture.mapping !== THREE.UVMapping) {
    throw new Error(`Unsupported ${semantic} texture mapping: ${texture.mapping}`);
  }
  texture.updateMatrix();
  if (!texture.matrix.equals(new THREE.Matrix3())) {
    throw new Error(
      `Unsupported ${semantic} texture transform. KHR_texture_transform is deferred from the core glTF slice.`
    );
  }
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
