"use client";;
import { motion, useSpring } from "motion/react";
import { memo, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { resolveTooltipBoxMotion, useChartConfig } from "../chart-config-context";
import { chartCssVars, useChart, useChartPortalContainer, useChartStable } from "../chart-context";
import { formatBandRange, weekdayDateFmt } from "../chart-formatters";
import { DateTicker } from "./date-ticker";
import { TooltipBox } from "./tooltip-box";
import { TooltipContent } from "./tooltip-content";
import { TooltipDot } from "./tooltip-dot";
import { TooltipIndicator } from "./tooltip-indicator";

/**
 * Hovered point for nearest-point hover: `activeDataKey`'s point, else the
 * first series with a value in the row. Positions are plot-relative.
 */
function resolveActivePoint(tooltipData, lines) {
  if (!tooltipData) {
    return null;
  }
  const { activeDataKey, xPositions, yPositions } = tooltipData;
  const hasY = (line) => yPositions[line.dataKey] !== undefined;
  const line =
    lines.find((l) => l.dataKey === activeDataKey && hasY(l)) ??
    lines.find(hasY);
  const y = line ? yPositions[line.dataKey] : undefined;
  if (!line || y === undefined) {
    return null;
  }
  return {
    line,
    index: lines.indexOf(line),
    x: xPositions?.[line.dataKey] ?? tooltipData.x,
    y,
  };
}

/** Smallest (topmost) hovered y across series — `indicatorEnd="point"`. */
function resolveTopmostPointY(tooltipData, lines) {
  if (!tooltipData) {
    return undefined;
  }
  let topmost;
  for (const line of lines) {
    const y = tooltipData.yPositions[line.dataKey];
    if (y !== undefined && (topmost === undefined || y < topmost)) {
      topmost = y;
    }
  }
  return topmost;
}

/** TooltipBox position props for the hovered row / point. */
function resolveBoxPlacement(
  {
    activePoint,
    tooltipData,
    lines,
    margin,
    isHorizontal,
    xWithMargin,
    topOffset
  }
) {
  if (activePoint) {
    // Beside the hovered point, vertically centred + clamped. The side is
    // picked from the column so a column's points share it, and a flip springs
    // across rather than replaying the entrance.
    return {
      flipX: xWithMargin,
      replayOnFlip: false,
      x: activePoint.x + margin.left,
      y: activePoint.y + margin.top,
    };
  }
  if (isHorizontal) {
    // Horizontal charts: centre on the first line's y (middle of the bar).
    const firstLineDataKey = lines[0]?.dataKey;
    const firstLineY = firstLineDataKey
      ? (tooltipData?.yPositions[firstLineDataKey] ?? 0)
      : 0;
    return { x: xWithMargin, y: firstLineY + margin.top };
  }
  const top = margin.top + topOffset;
  return { top, x: xWithMargin, y: top };
}

const ChartTooltipInner = memo(function ChartTooltipInner({
  showDatePill = true,
  showCrosshair: showCrosshairProp,
  showDots = true,
  dotVariant = "dot",
  dotSize = 5,
  dotHaloScale,
  dotHaloOpacity,
  dotHaloBlur,
  dotRadiusFraction,
  dotScale = 1,
  dotStrokeWidth,
  indicatorColor: indicatorColorProp,
  indicatorEndColor,
  indicatorEnd = "plot",
  content,
  rows: rowsRenderer,
  dotColor: dotColorProp,
  children,
  className = "",
  container,
  springConfig,
  matchCrosshair = false,
  damping,
  indicatorDasharray,
  indicatorFadeEdges,
  indicatorFadeLength,
  boxSpringConfig,
  panelStyle,
  backgroundColor,
  dateLabels: dateLabelsProp,
  exit = true,
  topOffset = 0
}) {
  const {
    tooltipData,
    width,
    height,
    innerHeight,
    margin,
    columnWidth,
    lines,
    bands,
    xAccessor,
    dateLabels: contextDateLabels,
    containerRef,
    orientation,
    barXAccessor,
    bandWidth,
    squareSnap,
    nearestPointHover,
  } = useChart();
  const tooltipBands = useMemo(
    () => (bands ?? []).filter((band) => band.showInTooltip),
    [bands]
  );
  const { tooltipSpring } = useChartConfig();
  const dateLabels = dateLabelsProp ?? contextDateLabels;

  const isHorizontal = orientation === "horizontal";
  // Bar charts (any orientation) and nearest-point hover (jittered scatter)
  // hide the crosshair line by default.
  const showCrosshair =
    showCrosshairProp ?? !(barXAccessor || nearestPointHover);
  const discreteInteraction = dateLabels.length > 60;

  const resolvedDotSize = useMemo(() => {
    if (dotVariant !== "ring" || !bandWidth || lines.length === 0) {
      return dotSize * dotScale;
    }
    const seriesCount = lines.length;
    const gap = squareSnap?.groupGap ?? (seriesCount > 1 ? 4 : 0);
    const squareSize = (bandWidth - gap * (seriesCount - 1)) / seriesCount;
    return (squareSize / 2) * dotScale;
  }, [
    bandWidth,
    dotScale,
    dotSize,
    dotVariant,
    lines.length,
    squareSnap?.groupGap,
  ]);
  const boxMotion = useMemo(() => {
    if (boxSpringConfig) {
      return {
        animate: !discreteInteraction,
        springConfig: boxSpringConfig,
      };
    }
    if (matchCrosshair) {
      return {
        animate: !discreteInteraction,
        springConfig: springConfig ?? tooltipSpring,
      };
    }
    return resolveTooltipBoxMotion(damping);
  }, [
    boxSpringConfig,
    damping,
    discreteInteraction,
    matchCrosshair,
    springConfig,
    tooltipSpring,
  ]);

  const visible = tooltipData !== null;
  const x = tooltipData?.x ?? 0;
  const xWithMargin = x + margin.left;

  // Nearest-point hover (jittered scatter): the dot and panel follow the
  // hovered point, not the column / first series.
  const activePoint = nearestPointHover
    ? resolveActivePoint(tooltipData, lines)
    : null;
  const boxPlacement = resolveBoxPlacement({
    activePoint,
    tooltipData,
    lines,
    margin,
    isHorizontal,
    xWithMargin,
    topOffset,
  });

  const tooltipRows = useMemo(() => {
    if (!tooltipData) {
      return [];
    }

    if (rowsRenderer) {
      return rowsRenderer(tooltipData.point);
    }

    // Default: generate rows from registered lines, then `<Band>` ranges.
    // With nearest-point hover (jittered scatter) a row may hold only some
    // series — skip the rest.
    const rowLines = nearestPointHover
      ? lines.filter(
          (line) => typeof tooltipData.point[line.dataKey] === "number"
        )
      : lines;
    const rows = rowLines.map((line) => ({
      color: line.stroke,
      label: line.dataKey,
      value: (tooltipData.point[line.dataKey]) ?? 0,
    }));
    for (const band of tooltipBands) {
      const value = formatBandRange(
        tooltipData.point,
        band.upperKey,
        band.lowerKey
      );
      if (value != null) {
        rows.push({ color: band.color, label: band.label, value });
      }
    }
    return rows;
  }, [tooltipData, lines, tooltipBands, rowsRenderer, nearestPointHover]);

  // One dot per band edge (deduped; edges shared with a `<Line>` use its dot).
  const bandDots = useMemo(() => {
    const lineKeys = new Set(lines.map((line) => line.dataKey));
    const seen = new Set();
    const dots = [];
    for (const band of tooltipBands) {
      for (const key of [band.upperKey, band.lowerKey]) {
        if (lineKeys.has(key) || seen.has(key)) {
          continue;
        }
        seen.add(key);
        dots.push({ key, color: band.color });
      }
    }
    return dots;
  }, [lines, tooltipBands]);

  const resolveDotColor = useMemo(() => {
    return (line, index) => {
      if (rowsRenderer && tooltipRows[index]?.color) {
        return tooltipRows[index].color;
      }
      if (dotColorProp != null) {
        if (typeof dotColorProp === "function" && tooltipData) {
          return dotColorProp(tooltipData.point, line);
        }
        if (typeof dotColorProp === "string") {
          return dotColorProp;
        }
      }
      return line.stroke;
    };
  }, [dotColorProp, rowsRenderer, tooltipData, tooltipRows]);

  // Resolve indicator color (static or from hovered point)
  const indicatorColor = useMemo(() => {
    if (indicatorColorProp == null) {
      return chartCssVars.crosshair;
    }
    if (typeof indicatorColorProp === "function") {
      return tooltipData
        ? indicatorColorProp(tooltipData.point)
        : chartCssVars.crosshair;
    }
    return indicatorColorProp;
  }, [indicatorColorProp, tooltipData]);

  const indicatorBottom =
    indicatorEnd === "point"
      ? resolveTopmostPointY(tooltipData, lines)
      : undefined;

  // Title from date or category
  const title = useMemo(() => {
    if (!tooltipData) {
      return undefined;
    }
    // For bar charts (horizontal or vertical), use the category name
    if (barXAccessor) {
      return barXAccessor(tooltipData.point);
    }
    // For line/area charts, use the date
    return weekdayDateFmt.format(xAccessor(tooltipData.point));
  }, [tooltipData, barXAccessor, xAccessor]);

  const tooltipContent = (
    <>
      {/* Crosshair indicator - rendered as SVG overlay */}
      {showCrosshair && (
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 overflow-visible"
          height="100%"
          width="100%"
        >
          <g transform={`translate(${margin.left},${margin.top})`}>
            <TooltipIndicator
              animate={!discreteInteraction}
              bottom={indicatorBottom}
              colorEdge={indicatorColor}
              colorEnd={indicatorEndColor}
              colorMid={indicatorColor}
              columnWidth={columnWidth}
              fadeEdges={
                indicatorDasharray ? "none" : (indicatorFadeEdges ?? "both")
              }
              fadeLength={indicatorFadeLength}
              height={innerHeight}
              springConfig={springConfig}
              strokeDasharray={indicatorDasharray}
              visible={visible}
              width="line"
              x={x}
            />
          </g>
        </svg>
      )}

      {/* Dots on bars/lines - show for vertical charts only */}
      {showDots && visible && !isHorizontal && (
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 overflow-visible"
          height="100%"
          width="100%"
        >
          <g transform={`translate(${margin.left},${margin.top})`}>
            {nearestPointHover
              ? // One dot that springs between points (any series) instead of
                // one per series mounting / unmounting as rows change.
                activePoint && (
                  <TooltipDot
                    color={resolveDotColor(activePoint.line, activePoint.index)}
                    cornerRadiusFraction={
                      dotVariant === "ring" ? dotRadiusFraction : undefined
                    }
                    haloBlur={dotHaloBlur}
                    haloOpacity={dotHaloOpacity}
                    haloScale={dotHaloScale}
                    size={resolvedDotSize}
                    springConfig={springConfig}
                    strokeColor={chartCssVars.background}
                    strokeWidth={dotStrokeWidth}
                    variant={dotVariant}
                    visible={visible}
                    x={activePoint.x}
                    y={activePoint.y}
                  />
                )
              : lines.map((line, index) => (
                  <TooltipDot
                    color={resolveDotColor(line, index)}
                    cornerRadiusFraction={
                      dotVariant === "ring" ? dotRadiusFraction : undefined
                    }
                    haloBlur={dotHaloBlur}
                    haloOpacity={dotHaloOpacity}
                    haloScale={dotHaloScale}
                    key={line.dataKey}
                    size={resolvedDotSize}
                    springConfig={springConfig}
                    strokeColor={chartCssVars.background}
                    strokeWidth={dotStrokeWidth}
                    variant={dotVariant}
                    visible={visible}
                    x={tooltipData?.xPositions?.[line.dataKey] ?? x}
                    y={tooltipData?.yPositions[line.dataKey] ?? 0}
                  />
                ))}
            {bandDots.map((dot) => {
              const y = tooltipData?.yPositions[dot.key];
              if (y == null) {
                return null;
              }
              return (
                <TooltipDot
                  color={
                    typeof dotColorProp === "string" ? dotColorProp : dot.color
                  }
                  cornerRadiusFraction={
                    dotVariant === "ring" ? dotRadiusFraction : undefined
                  }
                  haloBlur={dotHaloBlur}
                  haloOpacity={dotHaloOpacity}
                  haloScale={dotHaloScale}
                  key={`band-${dot.key}`}
                  size={resolvedDotSize}
                  springConfig={springConfig}
                  strokeColor={chartCssVars.background}
                  strokeWidth={dotStrokeWidth}
                  variant={dotVariant}
                  visible={visible}
                  x={x}
                  y={y}
                />
              );
            })}
          </g>
        </svg>
      )}

      {/* Tooltip Box */}
      <TooltipBox
        animate={boxMotion.animate}
        backgroundColor={backgroundColor}
        className={className}
        containerHeight={height}
        containerRef={containerRef}
        containerWidth={width}
        exit={exit}
        panelStyle={panelStyle}
        springConfig={boxMotion.springConfig}
        {...boxPlacement}
        visible={visible}
      >
        {content && tooltipData
          ? content({
              point: tooltipData.point,
              index: tooltipData.index,
            })
          : !content && (
              <TooltipContent rows={tooltipRows} title={title}>
                {children}
              </TooltipContent>
            )}
      </TooltipBox>

      {/* Date/Category Ticker - only show for vertical charts */}
      <DatePillTracker
        currentIndex={tooltipData?.index ?? 0}
        discreteInteraction={discreteInteraction}
        enabled={showDatePill && !isHorizontal}
        labels={dateLabels}
        springConfig={springConfig}
        visible={visible}
        xWithMargin={xWithMargin}
      />
    </>
  );

  return createPortal(tooltipContent, container);
});

export function ChartTooltip(props) {
  const { containerRef } = useChartStable();

  const container = useChartPortalContainer(containerRef);
  if (!container) {
    return null;
  }

  return <ChartTooltipInner {...props} container={container} />;
}

ChartTooltip.displayName = "ChartTooltip";

// Inner-only-on-visible so `useSpring` initializes at the real cursor x
// instead of `margin.left` on first hover.
function DatePillTracker(props) {
  if (!(props.enabled && props.visible && props.labels.length > 0)) {
    return null;
  }
  return <DatePillTrackerInner {...props} />;
}

function DatePillTrackerInner({
  labels,
  currentIndex,
  xWithMargin,
  discreteInteraction,
  springConfig,
  visible
}) {
  const { tooltipSpring } = useChartConfig();
  const effectiveSpring = springConfig ?? tooltipSpring;
  const animatedX = useSpring(xWithMargin, effectiveSpring);

  if (!discreteInteraction) {
    animatedX.set(xWithMargin);
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: we need to jump the animatedX when the visible prop changes
  useEffect(() => {
    animatedX.set(xWithMargin);
  }, [animatedX, visible]);

  return (
    <motion.div
      className="pointer-events-none absolute z-50 w-max"
      style={{
        left: discreteInteraction ? xWithMargin : animatedX,
        transform: "translateX(-50%)",
        bottom: 4,
      }}
    >
      <DateTicker
        currentIndex={currentIndex}
        labels={labels}
        visible={visible}
      />
    </motion.div>
  );
}

export default ChartTooltip;
