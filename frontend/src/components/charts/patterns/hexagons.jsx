/**
 * Ported from @visx/pattern 4.0.0 (https://github.com/airbnb/visx).
 * MIT License — Copyright (c) 2017-2018 Harrison Shoff. See ./LICENSE-visx-pattern.
 */
import { cn } from "@/lib/utils";
import { Path } from "./path";

export function Hexagons({
  id,
  height,
  fill,
  stroke,
  strokeWidth,
  strokeDasharray,
  strokeLinecap,
  shapeRendering,
  background,
  className,
  size = 3
}) {
  const sqrtSize = Math.sqrt(size);
  return (
    <Path
      background={background}
      className={cn("visx-pattern-hexagon", className)}
      fill={fill}
      height={sqrtSize}
      id={id}
      path={`M ${height},0 l ${height},0 l ${height / 2},${(height * sqrtSize) / 2} l ${-height / 2},${(height * sqrtSize) / 2} l ${-height},0 l ${-height / 2},${(-height * sqrtSize) / 2} Z M 0,${(height * sqrtSize) / 2} l ${height / 2},0 M ${3 * height},${(height * sqrtSize) / 2} l ${-height / 2},0`}
      shapeRendering={shapeRendering}
      stroke={stroke}
      strokeDasharray={strokeDasharray}
      strokeLinecap={strokeLinecap}
      strokeWidth={strokeWidth}
      width={size}
    />
  );
}
