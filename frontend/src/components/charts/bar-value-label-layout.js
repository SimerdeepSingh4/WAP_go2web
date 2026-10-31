/** Approximate rendered height of a 12px label. */
const LABEL_LINE_HEIGHT = 12;
/** Distance between a top/bottom-aligned label and the bar edge. */
const LABEL_INSET = 6;
/** Smallest bar thickness (across the text) that still fits a 12px label. */
const MIN_CROSS_SIZE = LABEL_LINE_HEIGHT + 6;

export function getBarValueLabelLayout({
  x,
  y,
  width,
  height,
  labelWidth,
  isHorizontal,
  orientation,
  position
}) {
  const normalFits = width >= labelWidth + 10 && height >= MIN_CROSS_SIZE;
  const rotatedFits = height >= labelWidth + 10 && width >= MIN_CROSS_SIZE;
  let fits = normalFits || rotatedFits;
  if (orientation === "horizontal") {
    fits = normalFits;
  } else if (orientation === "vertical") {
    fits = rotatedFits;
  }

  const rotated =
    fits &&
    (orientation === "vertical" || (orientation === "auto" && !normalFits));
  // Footprint of the (possibly rotated) label, so top/bottom placement keeps
  // the whole label inside the bar instead of just its centre point.
  const extentX = rotated ? LABEL_LINE_HEIGHT : labelWidth;
  const extentY = rotated ? labelWidth : LABEL_LINE_HEIGHT;

  let labelX = x + width / 2;
  let labelY = y + height / 2;
  if (isHorizontal) {
    // Horizontal bars: "top" is the value end (right), "bottom" the base (left).
    if (position === "top") {
      labelX = x + width - LABEL_INSET - extentX / 2;
    } else if (position === "bottom") {
      labelX = x + LABEL_INSET + extentX / 2;
    }
  } else if (position === "top") {
    labelY = y + LABEL_INSET + extentY / 2;
  } else if (position === "bottom") {
    labelY = y + height - LABEL_INSET - extentY / 2;
  }

  return { fits, rotated, x: labelX, y: labelY };
}
