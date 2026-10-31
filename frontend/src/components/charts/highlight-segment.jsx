"use client";;
import { motion } from "motion/react";
import { useId, useLayoutEffect, useRef } from "react";

export function HighlightSegment({
  pathRef,
  visible,
  stroke,
  strokeWidth,
  height,
  x,
  width,
  fadeLength = 0,
  glow
}) {
  const bandId = useId();
  const fadeId = `${bandId}-fade`;
  const highlightRef = useRef(null);
  const glowRef = useRef(null);

  // Copy the base stroke's `d` after commit (before paint) instead of reading
  // `pathRef.current` during render — same frame, and it picks up the base
  // path's `d` from this commit rather than the previous one.
  useLayoutEffect(() => {
    if (!visible) {
      return;
    }
    const d = pathRef.current?.getAttribute("d") || "";
    highlightRef.current?.setAttribute("d", d);
    glowRef.current?.setAttribute("d", d);
  });

  if (!visible) {
    return null;
  }

  const fade = Math.min(50, Math.max(0, fadeLength));
  const soft = fade > 0;
  // Bleed by the widest stroke so a stroke at the min/max value keeps its
  // full width (and the glow isn't cropped vertically).
  const bleed = Math.max(strokeWidth, glow ? glow.strokeWidth * 2 : 0);
  const band = (
    <motion.rect
      fill={soft ? `url(#${fadeId})` : undefined}
      height={height + bleed * 2}
      width={width}
      x={x}
      y={-bleed}
    />
  );

  return (
    <>
      <defs>
        {soft ? (
          // Horizontal luminance ramp over the band (objectBoundingBox is fine:
          // the band rect always has area). White = visible.
          <>
            <linearGradient id={fadeId} x1="0" x2="1" y1="0" y2="0">
              <stop offset="0" stopColor="white" stopOpacity={0} />
              <stop offset={fade / 100} stopColor="white" stopOpacity={1} />
              <stop offset={1 - fade / 100} stopColor="white" stopOpacity={1} />
              <stop offset="1" stopColor="white" stopOpacity={0} />
            </linearGradient>
            {/* userSpaceOnUse region: a near-flat path has a thin bbox, so the
                default objectBoundingBox region would crop the stroke. */}
            <mask
              height="300%"
              id={bandId}
              maskUnits="userSpaceOnUse"
              width="300%"
              x="-100%"
              y="-100%"
            >
              {band}
            </mask>
          </>
        ) : (
          <clipPath id={bandId}>{band}</clipPath>
        )}
      </defs>
      <motion.g
        animate={{ opacity: 1 }}
        clipPath={soft ? undefined : `url(#${bandId})`}
        exit={{ opacity: 0 }}
        initial={{ opacity: 0 }}
        mask={soft ? `url(#${bandId})` : undefined}
        transition={{ duration: 0.4, ease: "easeInOut" }}
      >
        {glow ? (
          <path
            fill="none"
            filter={glow.filter}
            ref={glowRef}
            stroke={stroke}
            strokeLinecap="round"
            strokeOpacity={glow.opacity}
            strokeWidth={glow.strokeWidth}
          />
        ) : null}
        <path
          fill="none"
          ref={highlightRef}
          stroke={stroke}
          strokeLinecap="round"
          strokeWidth={strokeWidth}
        />
      </motion.g>
    </>
  );
}

HighlightSegment.displayName = "HighlightSegment";

export default HighlightSegment;
