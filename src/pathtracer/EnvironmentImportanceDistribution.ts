import * as THREE from "three";

const MAX_DISTRIBUTION_WIDTH = 512;
const MAX_DISTRIBUTION_HEIGHT = 256;

export interface EnvironmentImportanceDistribution {
  conditional: THREE.DataTexture;
  marginal: THREE.DataTexture;
  size: THREE.Vector2;
  totalWeight: number;
}

/**
 * Builds a two-level CDF over an equirectangular HDR image. Pixel luminance is
 * multiplied by the row's spherical solid angle, so poles do not receive the
 * same probability mass as the much larger equatorial texels.
 */
export function buildEnvironmentImportanceDistribution(
  texture: THREE.DataTexture
): EnvironmentImportanceDistribution {
  const image = texture.image as unknown as {
    data: Float32Array | Uint16Array | Uint8Array;
    width: number;
    height: number;
  };
  const width = Math.min(image.width, MAX_DISTRIBUTION_WIDTH);
  const height = Math.min(image.height, MAX_DISTRIBUTION_HEIGHT);
  const channels = image.data.length / (image.width * image.height);
  if (!Number.isInteger(channels) || channels < 3) {
    throw new TypeError("Environment texture must contain at least RGB channels");
  }

  const luminanceSums = new Float64Array(width * height);
  const sampleCounts = new Uint32Array(width * height);
  for (let sourceY = 0; sourceY < image.height; sourceY++) {
    const targetY = Math.min(height - 1, Math.floor(sourceY * height / image.height));
    for (let sourceX = 0; sourceX < image.width; sourceX++) {
      const targetX = Math.min(width - 1, Math.floor(sourceX * width / image.width));
      const sourceOffset = (sourceY * image.width + sourceX) * channels;
      const r = readChannel(image.data, sourceOffset, texture.type);
      const g = readChannel(image.data, sourceOffset + 1, texture.type);
      const b = readChannel(image.data, sourceOffset + 2, texture.type);
      const targetIndex = targetY * width + targetX;
      luminanceSums[targetIndex] += Math.max(0, 0.2126 * r + 0.7152 * g + 0.0722 * b);
      sampleCounts[targetIndex]++;
    }
  }

  const weights = new Float64Array(width * height);
  const rowWeights = new Float64Array(height);
  let totalWeight = 0;
  for (let y = 0; y < height; y++) {
    const theta0 = Math.PI * y / height;
    const theta1 = Math.PI * (y + 1) / height;
    const solidAngleFactor = Math.cos(theta0) - Math.cos(theta1);
    for (let x = 0; x < width; x++) {
      const index = y * width + x;
      const averageLuminance = sampleCounts[index] > 0
        ? luminanceSums[index] / sampleCounts[index]
        : 0;
      const weight = averageLuminance * solidAngleFactor;
      weights[index] = weight;
      rowWeights[y] += weight;
      totalWeight += weight;
    }
  }

  // A completely black map has no meaningful importance distribution. Use a
  // solid-angle distribution so sampling and PDFs remain valid and unbiased.
  if (totalWeight <= 0) {
    totalWeight = 0;
    for (let y = 0; y < height; y++) {
      const theta0 = Math.PI * y / height;
      const theta1 = Math.PI * (y + 1) / height;
      const rowWeight = Math.cos(theta0) - Math.cos(theta1);
      rowWeights[y] = rowWeight * width;
      for (let x = 0; x < width; x++) weights[y * width + x] = rowWeight;
      totalWeight += rowWeights[y];
    }
  }

  const conditionalData = new Float32Array(width * height * 4);
  const marginalData = new Float32Array(height * 4);
  let marginalCdf = 0;
  for (let y = 0; y < height; y++) {
    const rowProbability = rowWeights[y] / totalWeight;
    marginalCdf += rowProbability;
    marginalData[y * 4] = y === height - 1 ? 1 : marginalCdf;
    marginalData[y * 4 + 1] = rowProbability;
    let conditionalCdf = 0;
    for (let x = 0; x < width; x++) {
      const probability = rowWeights[y] > 0 ? weights[y * width + x] / rowWeights[y] : 1 / width;
      conditionalCdf += probability;
      const offset = (y * width + x) * 4;
      conditionalData[offset] = x === width - 1 ? 1 : conditionalCdf;
      conditionalData[offset + 1] = probability;
    }
  }

  return {
    conditional: makeDataTexture(conditionalData, width, height),
    marginal: makeDataTexture(marginalData, height, 1),
    size: new THREE.Vector2(width, height),
    totalWeight,
  };
}

export function disposeEnvironmentImportanceDistribution(
  distribution: EnvironmentImportanceDistribution
) {
  distribution.conditional.dispose();
  distribution.marginal.dispose();
}

function readChannel(data: ArrayLike<number>, offset: number, type: THREE.TextureDataType) {
  const value = data[offset] ?? 0;
  return type === THREE.HalfFloatType ? THREE.DataUtils.fromHalfFloat(value) : value;
}

function makeDataTexture(data: Float32Array, width: number, height: number) {
  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.FloatType);
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.flipY = false;
  texture.needsUpdate = true;
  return texture;
}
