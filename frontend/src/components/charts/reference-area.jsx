"use client";

import { motion } from "motion/react";
import { useId, useLayoutEffect, useMemo } from "react";
import { chartCssVars, useChartStable, useYScale } from "./context/chart-context";
import { renderPatternPreset } from "./pattern-preset";
import { computeReferenceAreaRect } from "./lib/reference-area-geometry";
import { useReferenceAreaRegistration } from "./context/reference-area-registration-context";
import { normalizeYAxisId } from "./lib/y-axis-scales";
import { isReferenceAreaVisiblePhase } from "./lib/y-domain-utils";

const DEFAULT_FILL =
  "color-mix(in oklch, var(--chart-foreground-muted) 12%, transparent)";

const ENTER_FADE_MS = 420;

function clampFadeLength(length) {
  return Math.min(45, Math.max(0, length));
}

function bracketMarkerPath(centerX, edgeY, size, direction) {
  const half = size / 2;
  if (direction === "down") {
    return `M ${centerX - half} ${edgeY} L ${centerX + half} ${edgeY} L ${centerX} ${edgeY + size} Z`;
  }
  return `M ${centerX - half} ${edgeY} L ${centerX + half} ${edgeY} L ${centerX} ${edgeY - size} Z`;
}

export function ReferenceArea({
  y1,
  y2,
  x1,
  x2,
  yAxisId,
  fill = DEFAULT_FILL,
  fillOpacity = 1,
  pattern = "none",
  patternColor = chartCssVars.foregroundMuted,
  patternScale = 1,
  patternStrokeWidth,
  patternRadius,
  patternComplement,
  patternFill,
  patternDotFill,
  patternTileBackground,
  stroke = chartCssVars.foregroundMuted,
  strokeWidth = 1,
  strokeStyle = "dashed",
  strokeDasharray = "4,4",
  fadeEdges = true,
  fadeEdgesLength = 10,
  axisLabelColor,
  showMarkers = false,
  markerColor = "var(--chart-1)",
  markerSize = 6,
  ifOverflow = "hidden",
  className,
}) {
  const { innerWidth, innerHeight, xScale, chartPhase, enterTransition } =
    useChartStable();
  const yScale = useYScale(yAxisId);
  const uniqueId = useId().replace(/:/g, "");
  const registration = useReferenceAreaRegistration();

  useLayoutEffect(() => {
    if (!registration) {
      return;
    }
    registration.registerReferenceArea(uniqueId, {
      yAxisId: normalizeYAxisId(yAxisId),
      y1,
      y2,
      axisLabelColor,
    });
    return () => registration.unregisterReferenceArea(uniqueId);
  }, [registration, uniqueId, yAxisId, y1, y2, axisLabelColor]);

  const patternId = `chart-reference-area-pattern-${uniqueId}`;
  const hMaskId = `chart-reference-area-fade-${uniqueId}`;
  const hGradientId = `${hMaskId}-gradient`;

  const rect = useMemo(
    () =>
      computeReferenceAreaRect({
        innerWidth,
        innerHeight,
        x1,
        x2,
        y1,
        y2,
        ifOverflow,
        xScale,
        yScale,
      }),
    [innerWidth, innerHeight, x1, x2, y1, y2, ifOverflow, xScale, yScale]
  );

  const usesPattern = pattern !== "none";
  const patternNode = useMemo(() => {
    if (!usesPattern) {
      return null;
    }
    return renderPatternPreset(pattern, patternId, {
      color: patternColor,
      scale: patternScale,
      strokeWidth: patternStrokeWidth,
      radius: patternRadius,
      complement: patternComplement,
      fill: patternFill,
      dotFill: patternDotFill,
      tileBackground: patternTileBackground,
    });
  }, [
    usesPattern,
    pattern,
    patternId,
    patternColor,
    patternScale,
    patternStrokeWidth,
    patternRadius,
    patternComplement,
    patternFill,
    patternDotFill,
    patternTileBackground,
  ]);

  const fadeEdge = clampFadeLength(fadeEdgesLength);
  const edgeMask = fadeEdges ? `url(#${hMaskId})` : undefined;
  const lineDash = strokeStyle === "dashed" ? strokeDasharray : undefined;

  if (!rect) {
    return null;
  }

  const { x, y, width, height } = rect;
  const topEdgeY = y;
  const bottomEdgeY = y + height;
  const centerX = x + width / 2;
  const visible = isReferenceAreaVisiblePhase(chartPhase);
  const fadeTransition =
    enterTransition && typeof enterTransition === "object"
      ? enterTransition
      : { duration: ENTER_FADE_MS / 1000, ease: "easeOut" };
  const areaFill = usesPattern && patternNode ? `url(#${patternId})` : fill;

  return (
    <motion.g
      animate={{ opacity: visible ? 1 : 0 }}
      aria-hidden="true"
      className={className ?? "chart-reference-area"}
      initial={{ opacity: 0 }}
      transition={fadeTransition}
    >
      {edgeMask ? (
        <defs>
          <linearGradient id={hGradientId} x1="0%" x2="100%" y1="0%" y2="0%">
            <stop offset="0%" style={{ stopColor: "white", stopOpacity: 0 }} />
            <stop
              offset={`${fadeEdge}%`}
              style={{ stopColor: "white", stopOpacity: 1 }}
            />
            <stop
              offset={`${100 - fadeEdge}%`}
              style={{ stopColor: "white", stopOpacity: 1 }}
            />
            <stop
              offset="100%"
              style={{ stopColor: "white", stopOpacity: 0 }}
            />
          </linearGradient>
          <mask id={hMaskId}>
            <rect
              fill={`url(#${hGradientId})`}
              height={innerHeight}
              width={innerWidth}
              x={0}
              y={0}
            />
          </mask>
        </defs>
      ) : null}
      {patternNode ? <defs>{patternNode}</defs> : null}
      <rect
        fill={areaFill}
        fillOpacity={fillOpacity}
        height={height}
        mask={edgeMask}
        width={width}
        x={x}
        y={y}
      />
      <g mask={edgeMask}>
        <line
          stroke={stroke}
          strokeDasharray={lineDash}
          strokeWidth={strokeWidth}
          x1={x}
          x2={x + width}
          y1={topEdgeY}
          y2={topEdgeY}
        />
        <line
          stroke={stroke}
          strokeDasharray={lineDash}
          strokeWidth={strokeWidth}
          x1={x}
          x2={x + width}
          y1={bottomEdgeY}
          y2={bottomEdgeY}
        />
      </g>
      {showMarkers ? (
        <>
          <path
            d={bracketMarkerPath(centerX, topEdgeY, markerSize, "down")}
            fill={markerColor}
          />
          <path
            d={bracketMarkerPath(centerX, bottomEdgeY, markerSize, "up")}
            fill={markerColor}
          />
        </>
      ) : null}
    </motion.g>
  );
}

ReferenceArea.displayName = "ReferenceArea";

export default ReferenceArea;
