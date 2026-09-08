/** Linear RGB metrics; alpha is deliberately excluded. Buffers share row order. */
export function compareLinearFrames(reference: Float32Array | Float64Array, actual: Float32Array | Float64Array) {
  if (!reference.length || reference.length !== actual.length || reference.length % 4 !== 0) {
    throw new RangeError("Expected equally sized nonempty RGBA buffers.");
  }
  let squaredError = 0, squaredReference = 0, referenceLuminance = 0, actualLuminance = 0;
  const weights = [0.2126, 0.7152, 0.0722];
  for (let pixel = 0; pixel < reference.length; pixel += 4) {
    for (let channel = 0; channel < 3; channel++) {
      const r = reference[pixel + channel], a = actual[pixel + channel];
      if (!Number.isFinite(r) || !Number.isFinite(a)) throw new Error("Non-finite radiance.");
      squaredError += (a - r) ** 2;
      squaredReference += r * r;
      referenceLuminance += r * weights[channel];
      actualLuminance += a * weights[channel];
    }
  }
  const pixels = reference.length / 4;
  const rmse = Math.sqrt(squaredError / (pixels * 3));
  const meanReferenceLuminance = referenceLuminance / pixels;
  const meanActualLuminance = actualLuminance / pixels;
  return {
    pixels, rmse,
    nrmse: rmse / Math.max(1e-6, Math.sqrt(squaredReference / (pixels * 3))),
    meanReferenceLuminance, meanActualLuminance,
    relativeLuminanceBias: (meanActualLuminance - meanReferenceLuminance) / Math.max(1e-6, Math.abs(meanReferenceLuminance)),
  };
}
