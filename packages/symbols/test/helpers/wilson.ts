/** Wilson 95% interval for `successes` of `n` trials. n = 0 gives [0, 1]. */
export function wilson(successes: number, n: number): { lower: number; upper: number; rate: number } {
  if (n === 0) return { lower: 0, upper: 1, rate: 0 };
  const z = 1.959964;
  const p = successes / n;
  const denom = 1 + (z * z) / n;
  const centre = p + (z * z) / (2 * n);
  const margin = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return { lower: Math.max(0, (centre - margin) / denom), upper: Math.min(1, (centre + margin) / denom), rate: p };
}
