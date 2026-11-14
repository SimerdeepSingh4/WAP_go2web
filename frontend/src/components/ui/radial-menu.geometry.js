export function polarToCartesian(radius, angle) {
  const rad = angle * Math.PI / 180;
  return { x: Math.cos(rad) * radius, y: Math.sin(rad) * radius };
}

export function radialIndexAtPoint(x, y, centerX, centerY, total, deadZone = 0) {
  if (total <= 0 || Math.hypot(x - centerX, y - centerY) < deadZone) return null;
  const angle = (Math.atan2(y - centerY, x - centerX) * 180 / Math.PI + 450) % 360;
  return Math.round(angle / (360 / total)) % total;
}

export function radialSlicePath(index, total, outerRadius, innerRadius) {
  if (total <= 0) return "";
  if (total === 1) return `M ${outerRadius} 0 A ${outerRadius} ${outerRadius} 0 1 1 ${-outerRadius} 0 A ${outerRadius} ${outerRadius} 0 1 1 ${outerRadius} 0 M ${innerRadius} 0 A ${innerRadius} ${innerRadius} 0 1 0 ${-innerRadius} 0 A ${innerRadius} ${innerRadius} 0 1 0 ${innerRadius} 0`;
  const angle = 360 / total;
  const mid = -90 + angle * index;
  const outerStart = polarToCartesian(outerRadius, mid - angle / 2);
  const outerEnd = polarToCartesian(outerRadius, mid + angle / 2);
  const innerStart = polarToCartesian(innerRadius, mid - angle / 2);
  const innerEnd = polarToCartesian(innerRadius, mid + angle / 2);
  const large = angle > 180 ? 1 : 0;
  return `M ${outerStart.x} ${outerStart.y} A ${outerRadius} ${outerRadius} 0 ${large} 1 ${outerEnd.x} ${outerEnd.y} L ${innerEnd.x} ${innerEnd.y} A ${innerRadius} ${innerRadius} 0 ${large} 0 ${innerStart.x} ${innerStart.y} Z`;
}
