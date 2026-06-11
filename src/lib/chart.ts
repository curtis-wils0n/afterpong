// Round a y-axis to human-friendly ticks: pick a step (25, 50, 100, ...)
// that yields a handful of ticks, snap the domain to step multiples, and
// return the explicit tick values so the axis reads 900/950/1000 instead of
// data-derived offsets like 927/1227.
export function niceAxis(
  min: number,
  max: number,
  targetTicks = 5,
): { domain: [number, number]; ticks: number[] } {
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return { domain: [0, 1], ticks: [0, 1] };
  }
  // Pad a little so lines don't touch the chart edges, then snap.
  const span = Math.max(max - min, 1);
  const lo0 = min - span * 0.05;
  const hi0 = max + span * 0.05;
  const steps = [10, 20, 25, 50, 100, 200, 250, 500, 1000];
  const raw = (hi0 - lo0) / targetTicks;
  const step = steps.find((s) => s >= raw) ?? steps[steps.length - 1];
  const lo = Math.floor(lo0 / step) * step;
  const hi = Math.ceil(hi0 / step) * step;
  const ticks: number[] = [];
  for (let t = lo; t <= hi; t += step) ticks.push(t);
  return { domain: [lo, hi], ticks };
}
