export function computeNumberScrubValue(
  startValue: number,
  deltaY: number,
  step: number,
  coarseStep: number,
  precise: boolean,
  coarse: boolean
) {
  const activeStep = coarse ? coarseStep : step;
  const precision = precise ? 0.1 : 1;
  const value = startValue - deltaY * activeStep * 0.5 * precision;
  return coarse ? Math.round(value / coarseStep) * coarseStep : value;
}
