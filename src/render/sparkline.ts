interface SparklineOptions {
  lineColor?: string;
  fillTopColor?: string;
  fillBottomColor?: string;
}

export function createSparklineSvg(values: number[], width = 1040, height = 260, options: SparklineOptions = {}): string {
  if (values.length === 0) {
    return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg"></svg>`;
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const padding = 18;
  const baselineY = height - padding;

  const points = values.map((value, index) => {
    const x = (index / (values.length - 1 || 1)) * (width - padding * 2) + padding;
    const normalized = (value - min) / range;
    const y = baselineY - normalized * (height - padding * 2);
    return { x, y };
  });

  const line = points
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(" ");

  const area = `${line} L${points[points.length - 1].x.toFixed(2)} ${baselineY.toFixed(2)} L${points[0].x.toFixed(
    2
  )} ${baselineY.toFixed(2)} Z`;

  const lineColor = options.lineColor ?? "#ff4d4f";
  const fillTopColor = options.fillTopColor ?? "rgba(255, 45, 45, 0.7)";
  const fillBottomColor = options.fillBottomColor ?? "rgba(255, 45, 45, 0.05)";

  return `
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
  <defs>
    <linearGradient id="fillGradient" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${fillTopColor}" />
      <stop offset="100%" stop-color="${fillBottomColor}" />
    </linearGradient>
  </defs>
  <path d="${area}" fill="url(#fillGradient)"/>
  <path d="${line}" fill="none" stroke="${lineColor}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
`;
}
