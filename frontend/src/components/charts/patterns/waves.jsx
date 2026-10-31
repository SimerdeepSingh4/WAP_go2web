/**
 * Ported from @visx/pattern 4.0.0 (https://github.com/airbnb/visx).
 * MIT License — Copyright (c) 2017-2018 Harrison Shoff. See ./LICENSE-visx-pattern.
 */
import { cn } from "@/lib/utils";
import { Path } from "./path";

export function Waves({
  id,
  width,
  height,
  fill,
  stroke,
  strokeWidth,
  strokeDasharray,
  strokeLinecap,
  shapeRendering,
  background,
  className
}) {
  return (
    <Path
      background={background}
      className={cn("visx-pattern-wave", className)}
      fill={fill}
      height={height}
      id={id}
      path={`M 0 ${height / 2} c ${height / 8} ${-height / 4} , ${(height * 3) / 8} ${-height / 4} , ${height / 2} 0
             c ${height / 8} ${height / 4} , ${(height * 3) / 8} ${height / 4} , ${height / 2} 0 M ${-height / 2} ${height / 2}
             c ${height / 8} ${height / 4} , ${(height * 3) / 8} ${height / 4} , ${height / 2} 0 M ${height} ${height / 2}
             c ${height / 8} ${-height / 4} , ${(height * 3) / 8} ${-height / 4} , ${height / 2} 0`}
      shapeRendering={shapeRendering}
      stroke={stroke}
      strokeDasharray={strokeDasharray}
      strokeLinecap={strokeLinecap}
      strokeWidth={strokeWidth}
      width={width}
    />
  );
}
