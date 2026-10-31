/**
 * Tick values the way visx resolves them: explicit `tickValues`, else
 * `scale.ticks(numTicks)`, else the domain thinned to about `numTicks`
 * entries (every `round((n - 1) / numTicks)`-th value) when it is longer.
 */
export function gridTickValues(scale, numTicks = 10, tickValues) {
  if (tickValues) {
    return tickValues;
  }
  if ("ticks" in scale && scale.ticks) {
    return scale.ticks(numTicks);
  }
  return scale
    .domain()
    .filter(
      (_, index, all) =>
        numTicks == null ||
        all.length <= numTicks ||
        index % Math.round((all.length - 1) / numTicks) === 0
    );
}

/**
 * Pixel position of each grid line: `scale(tick)` (0 when unmapped) plus
 * `offset` plus half the band for band scales (visx `getScaleBandwidth`).
 */
export function gridLinePositions(
  scale,
  {
    numTicks,
    offset,
    tickValues
  } = {}
) {
  const bandOffset =
    "bandwidth" in scale && scale.bandwidth ? scale.bandwidth() / 2 : 0;
  const scaleOffset = (offset ?? 0) + bandOffset;
  return gridTickValues(scale, numTicks, tickValues).map((tick) => {
    const mapped = scale(tick);
    const value =
      mapped != null && typeof mapped === "object" ? mapped.valueOf() : mapped;
    return (value ?? 0) + scaleOffset;
  });
}

/** visx `Line` attributes, in visx order; rest props come after. */
function gridLine(
  key,
  x1,
  y1,
  x2,
  y2,
  {
    stroke,
    strokeWidth,
    strokeDasharray,
    lineStyle,
    rest
  }
) {
  const rectilinear = x1 === x2 || y1 === y2;
  // An object, not JSX attributes, so the formatter can't re-sort them.
  const props = {
    x1,
    y1,
    x2,
    y2,
    fill: "transparent",
    shapeRendering: rectilinear ? "crispEdges" : "auto",
    stroke,
    strokeWidth,
    strokeDasharray,
    style: lineStyle,
    ...rest,
  };
  return <line key={key} {...props} />;
}

export function GridRows(
  {
    top = 0,
    left = 0,
    scale,
    width,
    stroke = "#eaf0f6",
    strokeWidth = 1,
    strokeDasharray,
    className,
    numTicks = 10,
    lineStyle,
    offset,
    tickValues,
    ...rest
  }
) {
  const positions = gridLinePositions(scale, { numTicks, offset, tickValues });
  return (
    <g className={className} transform={`translate(${left}, ${top})`}>
      {positions.map((y, index) =>
        gridLine(`row-line-${index}`, 0, y, width, y, {
          stroke,
          strokeWidth,
          strokeDasharray,
          lineStyle,
          rest,
        })
      )}
    </g>
  );
}

export function GridColumns(
  {
    top = 0,
    left = 0,
    scale,
    height,
    stroke = "#eaf0f6",
    strokeWidth = 1,
    strokeDasharray,
    className,
    numTicks = 10,
    lineStyle,
    offset,
    tickValues,
    ...rest
  }
) {
  const positions = gridLinePositions(scale, { numTicks, offset, tickValues });
  return (
    <g className={className} transform={`translate(${left}, ${top})`}>
      {positions.map((x, index) =>
        gridLine(`column-line-${index}`, x, 0, x, height, {
          stroke,
          strokeWidth,
          strokeDasharray,
          lineStyle,
          rest,
        })
      )}
    </g>
  );
}
