export function resolveFadeSides(fade) {
  if (fade === false) {
    return { left: false, right: false, any: false };
  }
  if (fade === "left") {
    return { left: true, right: false, any: true };
  }
  if (fade === "right") {
    return { left: false, right: true, any: true };
  }
  return { left: true, right: true, any: true };
}

/**
 * Stops for a horizontal fade gradient with opacity 0 at the faded side(s)
 * and opacity 1 in the middle. Matches the historic 0/15/85/100 pattern.
 */
export function fadeGradientStops(sides) {
  return [
    { offset: "0%", opacity: sides.left ? 0 : 1 },
    { offset: "15%", opacity: 1 },
    { offset: "85%", opacity: 1 },
    { offset: "100%", opacity: sides.right ? 0 : 1 },
  ];
}

export function resolveStrokeGradientStops(gradient) {
  if (!gradient || gradient.length === 0) {
    return null;
  }
  const last = Math.max(1, gradient.length - 1);
  return gradient
    .map((stop, index) =>
      typeof stop === "string"
        ? { offset: gradient.length === 1 ? 0 : index / last, color: stop }
        : {
            offset: Math.min(1, Math.max(0, stop.offset)),
            color: stop.color,
          }
    )
    .sort((a, b) => a.offset - b.offset);
}

function percentToFraction(offset) {
  return Number.parseFloat(offset) / 100;
}

function roundPercent(value) {
  return Math.round(value * 10_000) / 100;
}

/** Colour at `t` on piecewise-linear stops (sRGB, matching SVG gradient interpolation). */
function colorAt(stops, t) {
  const first = stops[0];
  const last = stops.at(-1);
  if (t <= first.offset) {
    return first.color;
  }
  if (t >= last.offset) {
    return last.color;
  }
  for (let i = 1; i < stops.length; i++) {
    const b = stops[i];
    if (t > b.offset) {
      continue;
    }
    const a = stops[i - 1];
    if (t === b.offset || b.offset === a.offset) {
      return b.color;
    }
    const mix = roundPercent((t - a.offset) / (b.offset - a.offset));
    return `color-mix(in srgb, ${b.color} ${mix}%, ${a.color})`;
  }
  return last.color;
}

function opacityAt(stops, t) {
  let prev = stops[0];
  for (const stop of stops) {
    const offset = percentToFraction(stop.offset);
    const prevOffset = percentToFraction(prev.offset);
    if (t <= offset) {
      if (offset === prevOffset) {
        return stop.opacity;
      }
      const progress = (t - prevOffset) / (offset - prevOffset);
      return prev.opacity + (stop.opacity - prev.opacity) * progress;
    }
    prev = stop;
  }
  return prev.opacity;
}

/**
 * Stops for a horizontal stroke paint that combines a colour gradient with the
 * edge-fade opacity stops. Either input may be absent; offsets are merged so
 * the colour ramp and the fade compose instead of replacing each other.
 */
export function horizontalPaintStops(
  {
    color,
    colorStops,
    fadeStops
  }
) {
  const offsets = new Set();
  for (const stop of colorStops ?? []) {
    offsets.add(stop.offset);
  }
  for (const stop of fadeStops ?? []) {
    offsets.add(percentToFraction(stop.offset));
  }
  if (offsets.size === 0) {
    offsets.add(0);
  }
  return [...offsets]
    .sort((a, b) => a - b)
    .map((t) => ({
      offset: `${roundPercent(t)}%`,
      color: colorStops ? colorAt(colorStops, t) : color,
      opacity: fadeStops ? opacityAt(fadeStops, t) : 1,
    }));
}

/** Horizontal fade gradient pinned to the chart viewport (not the series path bounds). */
export function viewportFadeGradientAttrs(innerWidth) {
  return {
    gradientUnits: "userSpaceOnUse",
    x1: 0,
    x2: innerWidth,
    y1: 0,
    y2: 0,
  };
}
