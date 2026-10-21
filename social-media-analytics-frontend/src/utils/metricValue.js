/** Parse only standalone numeric values that are safe to animate with CountUp. */
export function parseMetricValue(value) {
  if (typeof value === 'number') return { num: value, suffix: '' };
  if (typeof value !== 'string') return null;

  const match = value.trim().match(/^(-?[\d,]+(?:\.\d+)?)(%)?$/);
  if (!match) return null;

  const num = Number(match[1].replace(/,/g, ''));
  return Number.isFinite(num) ? { num, suffix: match[2] || '' } : null;
}
