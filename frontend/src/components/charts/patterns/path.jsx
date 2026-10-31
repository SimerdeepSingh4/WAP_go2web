/**
 * Ported from @visx/pattern 4.0.0 (https://github.com/airbnb/visx).
 * MIT License — Copyright (c) 2017-2018 Harrison Shoff. See ./LICENSE-visx-pattern.
 */
import { cn } from "@/lib/utils";
import { Pattern } from "./pattern";

export function Path({
  id,
  width,
  height,
  path,
  fill = "transparent",
  stroke,
  strokeWidth,
  strokeDasharray,
  strokeLinecap = "square",
  shapeRendering = "auto",
  background,
  className
}) {
  return (
    <Pattern height={height} id={id} width={width}>
      {!!background && <rect fill={background} height={height} width={width} />}
      <path
        className={cn("visx-pattern-path", className)}
        d={path}
        fill={fill}
        shapeRendering={shapeRendering}
        stroke={stroke}
        strokeDasharray={strokeDasharray}
        strokeLinecap={strokeLinecap}
        strokeWidth={strokeWidth}
      />
    </Pattern>
  );
}
