/**
 * Ported from @visx/pattern 4.0.0 (https://github.com/airbnb/visx).
 * MIT License — Copyright (c) 2017-2018 Harrison Shoff. See ./LICENSE-visx-pattern.
 */
import { cn } from "@/lib/utils";
import { PatternOrientation } from "./constants";
import { Pattern } from "./pattern";

export function pathForOrientation(
  {
    height,
    orientation
  }
) {
  switch (orientation) {
    case PatternOrientation.horizontal:
      return `M 0,${height / 2} l ${height},0`;
    case PatternOrientation.diagonal:
      return `M 0,${height} l ${height},${-height} M ${-height / 4},${height / 4} l ${height / 2},${-height / 2}
             M ${(3 / 4) * height},${(5 / 4) * height} l ${height / 2},${-height / 2}`;
    case PatternOrientation.diagonalRightToLeft:
      return `M 0,0 l ${height},${height}
        M ${-height / 4},${(3 / 4) * height} l ${height / 2},${height / 2}
        M ${(3 / 4) * height},${-height / 4} l ${height / 2},${height / 2}`;
    default:
      return `M ${height / 2}, 0 l 0, ${height}`;
  }
}

export function Lines({
  id,
  width,
  height,
  stroke,
  strokeWidth,
  strokeDasharray,
  strokeLinecap = "square",
  shapeRendering = "auto",
  orientation = ["vertical"],
  background,
  className
}) {
  const orientations = Array.isArray(orientation)
    ? orientation
    : [orientation];
  return (
    <Pattern height={height} id={id} width={width}>
      {!!background && (
        <rect
          className={cn("visx-pattern-line-background")}
          fill={background}
          height={height}
          width={width}
        />
      )}
      {orientations.map((o, i) => (
        <path
          className={cn("visx-pattern-line", className)}
          d={pathForOrientation({ orientation: o, height })}
          // biome-ignore lint/suspicious/noArrayIndexKey: duplicate orientations are allowed; matches upstream key.
          key={`visx-${id}-line-${o}-${i}`}
          shapeRendering={shapeRendering}
          stroke={stroke}
          strokeDasharray={strokeDasharray}
          strokeLinecap={strokeLinecap}
          strokeWidth={strokeWidth}
        />
      ))}
    </Pattern>
  );
}
