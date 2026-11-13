"use client";;
import { scaleBand, scaleLinear } from "d3-scale";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { DEFAULT_ANIMATION_EASING } from "./lib/animation";
import { topSquareCenterY } from "./lib/bar-squares-layout";
import {
  forEachChartChild,
  isClipExcludedComponent,
  isPostOverlayComponent,
  isUnderlayComponent,
  renderKeyedChartLayers,
  resolveChartChildElement,
} from "./lib/chart-child-passthrough";
import { ChartProvider } from "./context/chart-context";
import { isGradientDefComponent, isPatternDefComponent } from "./lib/chart-defs";
import { shortDateFmt } from "./lib/chart-formatters";
import { ParentSize } from "./chart-parent-size";
import { DEFAULT_CHART_LIFECYCLE, resolveRestingChartPhase } from "./lib/chart-phase";
import { BarLoadingSkeleton } from "./loading-sweep";
import { localPoint } from "./lib/local-point";
import { extractReferenceAreaConfigs } from "./lib/reference-area-config";
import { useScheduledTooltip } from "./hooks/use-scheduled-tooltip";
import {
  buildYScalesForLines,
  getPrimaryYScale,
  normalizeYAxisId,
  wrapSingleYScale,
} from "./lib/y-axis-scales";
import {
  collectBarValueExtents,
  resolveBarValueDomain,
} from "./lib/y-domain-utils";

/** Skeleton bars to show when `status="loading"` and `data` is empty. */
const FALLBACK_LOADING_BARS = 12;

const DEFAULT_MARGIN = { top: 40, right: 40, bottom: 40, left: 40 };

function isSeriesOverlayComponent(child) {
  const childType = child.type;
  const componentName =
    typeof child.type === "function"
      ? childType.displayName || childType.name || ""
      : "";
  return componentName === "TrendLine";
}

// Extract bar configs from children synchronously
function extractBarConfigs(children) {
  const configs = [];

  forEachChartChild(children, (child) => {
    const childType = child.type;
    // Bar-depth surface layers (BarDepthBack/Front, BarPulse) carry a
    // `dataKey` to pair with a Bar but are not series themselves — skip them
    // so they don't inflate the series count and shrink the real bars.
    if (childType.__isBarDepthLayer) {
      return;
    }
    const componentName =
      typeof child.type === "function"
        ? childType.displayName || childType.name || ""
        : "";
    // Trend overlays fit an existing series — not a bar series themselves.
    if (componentName === "TrendLine") {
      return;
    }

    const props = child.props;
    const isBarComponent =
      componentName === "Bar" ||
      componentName === "BarSquares" ||
      (props && typeof props.dataKey === "string" && props.dataKey.length > 0);

    if (isBarComponent && props?.dataKey) {
      // Use stroke for tooltip dot color if provided, otherwise fall back to fill
      // This allows gradient/pattern fills to have a solid dot color
      const dotColor =
        props.stroke || props.fill || "var(--chart-line-primary)";
      configs.push({
        dataKey: props.dataKey,
        stroke: dotColor,
        strokeWidth: 0,
        yAxisId: props.yAxisId,
      });
    }
  });

  return configs;
}

function ChartInner(props) {
  const { width, height } = props;
  if (width < 10 || height < 10) {
    return null;
  }
  return <ChartCore {...props} />;
}

const ChartCore = memo(function ChartCore({
  width,
  height,
  data,
  xDataKey,
  margin,
  animationDuration,
  animationEasing,
  enterTransition,
  revealSignature = "",
  barGap,
  barWidthProp,
  orientation,
  stacked,
  stackGap,
  squareSnap,
  children,
  containerRef,
  onPhaseChange,
  status,
  loadingFill
}) {
  const { tooltipData, setTooltipData, scheduleTooltip, clearTooltip } =
    useScheduledTooltip();
  // A zero-duration reveal is loaded from the first render, so static charts
  // don't re-render (cursor / interaction wiring) after their first paint.
  const [isLoaded, setIsLoaded] = useState(
    () => animationDuration <= 0 && status !== "loading"
  );
  const [revealEpoch, setRevealEpoch] = useState(1);
  const hoveredBarIndex = tooltipData?.index ?? null;

  const isHorizontal = orientation === "horizontal";

  // Extract bar configs synchronously from children
  const lines = useMemo(() => extractBarConfigs(children), [children]);
  const effectiveLoadingFill =
    loadingFill ?? lines[0]?.stroke ?? "var(--foreground)";

  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  // Category accessor function - returns string for categorical scale
  const categoryAccessor = useCallback(
    d => {
      const value = d[xDataKey];
      if (value instanceof Date) {
        return shortDateFmt.format(value);
      }
      return String(value ?? "");
    },
    [xDataKey]
  );

  // For compatibility with ChartContext, provide a Date-based xAccessor
  const xAccessorDate = useCallback(
    d => {
      const value = d[xDataKey];
      if (value instanceof Date) {
        return value;
      }
      return new Date();
    },
    [xDataKey]
  );

  // Category scale (band) - for the categorical axis
  const categoryScale = useMemo(() => {
    const domain = data.map((d) => categoryAccessor(d));
    const range = isHorizontal
      ? [0, innerHeight]
      : [0, innerWidth];
    return scaleBand().domain(domain).range(range).padding(barGap);
  }, [innerWidth, innerHeight, data, categoryAccessor, barGap, isHorizontal]);

  // Band width for bars - use prop if provided, otherwise use scale's bandwidth
  const bandWidth = barWidthProp ?? categoryScale.bandwidth();

  const valueExtents = useMemo(
    () =>
      collectBarValueExtents(
        data,
        lines.map((line) => line.dataKey),
        stacked
      ),
    [data, lines, stacked]
  );

  // Value scale (linear) - for the value axis. Always includes zero so bars
  // grow from the zero line in either direction.
  const valueScale = useMemo(() => {
    const range = isHorizontal ? [0, innerWidth] : [innerHeight, 0];
    return scaleLinear()
      .domain(resolveBarValueDomain(valueExtents))
      .nice()
      .range(range);
  }, [innerWidth, innerHeight, valueExtents, isHorizontal]);

  const yScales = useMemo(() => {
    if (isHorizontal) {
      return wrapSingleYScale(valueScale);
    }
    return buildYScalesForLines({
      lines,
      data,
      innerHeight,
      resolveDomain: (dataKeys) =>
        resolveBarValueDomain(collectBarValueExtents(data, dataKeys, stacked)),
    });
  }, [data, innerHeight, isHorizontal, lines, stacked, valueScale]);

  const primaryYScale = getPrimaryYScale(yScales, valueScale);

  // Compute stack offsets for stacked bars
  const stackOffsets = useMemo(() => {
    if (!stacked) {
      return undefined;
    }
    const offsets = new Map();
    for (let i = 0; i < data.length; i++) {
      const d = data[i];
      if (!d) {
        continue;
      }
      const pointOffsets = new Map();
      let cumulative = 0;
      for (const line of lines) {
        pointOffsets.set(line.dataKey, cumulative);
        const value = d[line.dataKey];
        if (typeof value === "number") {
          cumulative += value;
        }
      }
      offsets.set(i, pointOffsets);
    }
    return offsets;
  }, [data, lines, stacked]);

  // Column width for tooltip indicator
  const columnWidth = useMemo(() => {
    if (data.length < 1) {
      return 0;
    }
    return isHorizontal ? innerHeight / data.length : innerWidth / data.length;
  }, [innerWidth, innerHeight, data.length, isHorizontal]);

  // Pre-compute labels for ticker animation
  const dateLabels = useMemo(
    () => data.map((d) => categoryAccessor(d)),
    [data, categoryAccessor]
  );

  // Create a fake time scale for compatibility with ChartContext
  const fakeTimeScale = useMemo(() => {
    const now = Date.now();
    const start = now - data.length * 24 * 60 * 60 * 1000;
    const scale = {
      ...categoryScale,
      domain: () => [new Date(start), new Date(now)],
      range: () => [0, innerWidth],
      invert: (x) => new Date(start + (x / innerWidth) * (now - start)),
      copy: () => scale,
    };
    return scale;
  }, [categoryScale, innerWidth, data.length]);

  // Animation timing — replay when motion settings / status change. The
  // reset is adjusted during render ("store previous props in state") instead
  // of setState in an effect, so a replay costs a single render.
  const [revealKey, setRevealKey] = useState({
    animationDuration,
    revealSignature,
    status,
  });
  if (
    revealKey.animationDuration !== animationDuration ||
    revealKey.revealSignature !== revealSignature ||
    revealKey.status !== status
  ) {
    setRevealKey({ animationDuration, revealSignature, status });
    setRevealEpoch((n) => n + 1);
    setIsLoaded(animationDuration <= 0 && status !== "loading");
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: revealSignature
  useEffect(() => {
    // While loading, hold the skeleton (no reveal, no interaction). When
    // status flips to "ready" this effect re-runs and plays the grow reveal.
    if (status === "loading") {
      return;
    }
    const staggerMs = data.length > 1 ? animationDuration * 0.4 : 0;
    const timer = setTimeout(() => {
      setIsLoaded(true);
    }, animationDuration + staggerMs);
    return () => clearTimeout(timer);
  }, [animationDuration, revealSignature, status]);

  useEffect(() => {
    onPhaseChange?.(isLoaded ? "ready" : "revealing");
  }, [isLoaded, onPhaseChange]);

  // Mouse move handler
  const handleMouseMove = useCallback(
    (event) => {
      const point = localPoint(event);
      if (!point) {
        return;
      }

      const pos = isHorizontal ? point.y - margin.top : point.x - margin.left;

      // Find which band the mouse is over
      const bandIndex = Math.floor(pos / columnWidth);
      const clampedIndex = Math.max(0, Math.min(data.length - 1, bandIndex));
      const d = data[clampedIndex];

      if (!d) {
        return;
      }

      // Calculate positions for each bar
      const yPositions = {};
      const xPositions = {};
      const barPos = categoryScale(categoryAccessor(d)) ?? 0;

      if (isHorizontal) {
        // Horizontal bars: dots at end of bar (x = value), centered vertically in band
        const seriesCount = lines.length;
        const groupGap = seriesCount > 1 ? 4 : 0;
        const individualBarHeight =
          seriesCount > 0
            ? (bandWidth - groupGap * (seriesCount - 1)) / seriesCount
            : bandWidth;

        if (stacked) {
          // Stacked horizontal: all bars same y, x at cumulative end
          let cumulative = 0;
          for (const line of lines) {
            const value = d[line.dataKey];
            if (typeof value === "number") {
              cumulative += value;
              const axisScale =
                yScales[normalizeYAxisId(line.yAxisId)] ?? valueScale;
              xPositions[line.dataKey] = axisScale(cumulative) ?? 0;
              yPositions[line.dataKey] = barPos + bandWidth / 2;
            }
          }
        } else {
          // Grouped horizontal: each bar at its own y position
          lines.forEach((line, idx) => {
            const value = d[line.dataKey];
            if (typeof value === "number") {
              const axisScale =
                yScales[normalizeYAxisId(line.yAxisId)] ?? valueScale;
              xPositions[line.dataKey] = axisScale(value) ?? 0;
              yPositions[line.dataKey] =
                barPos +
                idx * (individualBarHeight + groupGap) +
                individualBarHeight / 2;
            }
          });
        }
      } else if (stacked) {
        // Vertical stacked bars
        let cumulative = 0;
        let seriesIdx = 0;
        for (const line of lines) {
          const value = d[line.dataKey];
          if (typeof value === "number") {
            cumulative += value;
            const axisScale =
              yScales[normalizeYAxisId(line.yAxisId)] ?? primaryYScale;
            const gapOffset = seriesIdx * stackGap;
            yPositions[line.dataKey] = (axisScale(cumulative) ?? 0) - gapOffset;
            seriesIdx++;
          }
        }
      } else {
        // Vertical grouped bars
        const seriesCount = lines.length;
        const groupGap = seriesCount > 1 ? 4 : 0;
        const individualBarWidth =
          seriesCount > 0
            ? (bandWidth - groupGap * (seriesCount - 1)) / seriesCount
            : bandWidth;

        lines.forEach((line, idx) => {
          const value = d[line.dataKey];
          if (typeof value === "number") {
            const axisScale =
              yScales[normalizeYAxisId(line.yAxisId)] ?? primaryYScale;
            const baselineY = axisScale(0) ?? innerHeight;
            const valueY = axisScale(value) ?? 0;
            const barLengthPx = baselineY - valueY;

            if (squareSnap && !isHorizontal && value > 0) {
              yPositions[line.dataKey] = topSquareCenterY({
                baselineY,
                barLengthPx,
                squareSize: individualBarWidth,
                gap: squareSnap.squareGap,
                fit: squareSnap.fit,
              });
            } else {
              yPositions[line.dataKey] = valueY;
            }

            xPositions[line.dataKey] =
              barPos +
              idx * (individualBarWidth + groupGap) +
              individualBarWidth / 2;
          }
        });
      }

      // Tooltip position: for horizontal, position at max bar end; for vertical, center of band
      let tooltipX;
      if (isHorizontal) {
        // Position tooltip at the right-most bar edge — the value end for
        // positive bars, the zero line for negative ones.
        const maxX = Math.max(...Object.values(xPositions), valueScale(0) ?? 0);
        tooltipX = maxX;
      } else {
        tooltipX = barPos + bandWidth / 2;
      }

      scheduleTooltip({
        point: d,
        index: clampedIndex,
        x: tooltipX,
        yPositions,
        xPositions: Object.keys(xPositions).length > 0 ? xPositions : undefined,
      });
    },
    [
      categoryScale,
      valueScale,
      data,
      lines,
      margin.left,
      margin.top,
      categoryAccessor,
      columnWidth,
      bandWidth,
      isHorizontal,
      stacked,
      stackGap,
      scheduleTooltip,
      yScales,
      primaryYScale,
      squareSnap,
      innerHeight,
    ]
  );

  const handleMouseLeave = useCallback(() => {
    clearTooltip();
  }, [clearTooltip]);

  const canInteract = isLoaded;

  // Separate children into defs, pre-overlay, and post-overlay
  const defsChildren = [];
  const clipExcludedChildren = [];
  const underlayChildren = [];
  const preOverlayChildren = [];
  // Trend lines draw above every bar regardless of child order.
  const seriesOverlayChildren = [];
  const postOverlayChildren = [];

  forEachChartChild(children, (child) => {
    const resolvedChild = resolveChartChildElement(child);

    if (isGradientDefComponent(child)) {
      defsChildren.push(child);
    } else if (isPatternDefComponent(child)) {
      preOverlayChildren.push(child);
    } else if (isPostOverlayComponent(resolvedChild)) {
      postOverlayChildren.push(child);
    } else if (isClipExcludedComponent(resolvedChild)) {
      clipExcludedChildren.push(child);
    } else if (isUnderlayComponent(resolvedChild)) {
      underlayChildren.push(child);
    } else if (isSeriesOverlayComponent(resolvedChild)) {
      seriesOverlayChildren.push(child);
    } else {
      preOverlayChildren.push(child);
    }
  });

  const referenceAreas = useMemo(
    () => extractReferenceAreaConfigs(children),
    [children]
  );

  const contextValue = {
    ...DEFAULT_CHART_LIFECYCLE,
    chartPhase: resolveRestingChartPhase(status),
    chartStatus: status,
    data,
    renderData: data,
    xScale: fakeTimeScale,
    yScale: isHorizontal ? valueScale : primaryYScale,
    yScales,
    width,
    height,
    innerWidth,
    innerHeight,
    margin,
    columnWidth,
    tooltipData,
    setTooltipData,
    containerRef,
    lines,
    referenceAreas,
    isLoaded,
    animationDuration,
    animationEasing,
    enterTransition,
    revealEpoch,
    xAccessor: xAccessorDate,
    dateLabels,
    // Bar-specific properties
    barScale: categoryScale,
    bandWidth,
    hoveredBarIndex,
    barXAccessor: categoryAccessor,
    orientation,
    stacked,
    stackOffsets,
    squareSnap,
  };

  return (
    <ChartProvider value={contextValue}>
      <svg
        aria-hidden="true"
        className="overflow-visible"
        height={height}
        width={width}
      >
        {/* Gradient and pattern definitions */}
        {defsChildren.length > 0 && <defs>{defsChildren}</defs>}

        <rect fill="transparent" height={height} width={width} x={0} y={0} />

        {/* biome-ignore lint/a11y/noStaticElementInteractions: Chart interaction area */}
        <g
          onMouseLeave={canInteract ? handleMouseLeave : undefined}
          onMouseMove={canInteract ? handleMouseMove : undefined}
          style={{ cursor: canInteract ? "crosshair" : "default" }}
          transform={`translate(${margin.left},${margin.top})`}
        >
          {/* Background rect for mouse event detection */}
          <rect
            fill="transparent"
            height={innerHeight}
            width={innerWidth}
            x={0}
            y={0}
          />

          {renderKeyedChartLayers(clipExcludedChildren)}
          {renderKeyedChartLayers(underlayChildren)}
          {status === "loading" ? (
            <BarLoadingSkeleton
              barCount={data.length || FALLBACK_LOADING_BARS}
              fill={effectiveLoadingFill}
              innerHeight={innerHeight}
              innerWidth={innerWidth}
            />
          ) : (
            <>
              {renderKeyedChartLayers(preOverlayChildren)}
              {renderKeyedChartLayers(seriesOverlayChildren)}
            </>
          )}

          {/* Markers rendered last so they're on top for interaction */}
          {renderKeyedChartLayers(postOverlayChildren)}
        </g>
      </svg>
    </ChartProvider>
  );
});

export function BarChart({
  data,
  xDataKey = "name",
  margin: marginProp,
  animationDuration = 1100,
  animationEasing = DEFAULT_ANIMATION_EASING,
  enterTransition,
  revealSignature,
  aspectRatio = "2 / 1",
  className = "",
  barGap = 0.2,
  barWidth,
  orientation = "vertical",
  stacked = false,
  stackGap = 0,
  squareSnap,
  children,
  onPhaseChange,
  status = "ready",
  loadingFill
}) {
  const containerRef = useRef(null);
  const margin = { ...DEFAULT_MARGIN, ...marginProp };

  return (
    <div
      className={cn("relative w-full overflow-visible", className)}
      ref={containerRef}
      style={{ aspectRatio }}
    >
      <ParentSize debounceTime={10}>
        {({ width, height }) => (
          <ChartInner
            animationDuration={animationDuration}
            animationEasing={animationEasing}
            barGap={barGap}
            barWidthProp={barWidth}
            containerRef={containerRef}
            data={data}
            enterTransition={enterTransition}
            height={height}
            loadingFill={loadingFill}
            margin={margin}
            onPhaseChange={onPhaseChange}
            orientation={orientation}
            revealSignature={revealSignature}
            squareSnap={squareSnap}
            stacked={stacked}
            stackGap={stackGap}
            status={status}
            width={width}
            xDataKey={xDataKey}
          >
            {children}
          </ChartInner>
        )}
      </ParentSize>
    </div>
  );
}

BarChart.displayName = "BarChart";

export default BarChart;
