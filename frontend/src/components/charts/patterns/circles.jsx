/**
 * Ported from @visx/pattern 4.0.0 (https://github.com/airbnb/visx).
 * MIT License — Copyright (c) 2017-2018 Harrison Shoff. See ./LICENSE-visx-pattern.
 */
import { cn } from "@/lib/utils";
import { Pattern } from "./pattern";

export function Circles({
  id,
  width,
  height,
  radius = 2,
  fill,
  stroke,
  strokeWidth,
  strokeDasharray,
  background,
  complement = false,
  className
}) {
  let corners;
  if (complement) {
    corners = [
      [0, 0],
      [0, height],
      [width, 0],
      [width, height],
    ];
  }
  return (
    <Pattern height={height} id={id} width={width}>
      {!!background && <rect fill={background} height={height} width={width} />}
      <circle
        className={cn("visx-pattern-circle", className)}
        cx={width / 2}
        cy={height / 2}
        fill={fill}
        r={radius}
        stroke={stroke}
        strokeDasharray={strokeDasharray}
        strokeWidth={strokeWidth}
      />
      {corners?.map(([cornerX, cornerY]) => (
        <circle
          className={cn(
            "visx-pattern-circle visx-pattern-circle-complement",
            className
          )}
          cx={cornerX}
          cy={cornerY}
          fill={fill}
          key={`${id}-complement-${cornerX}-${cornerY}`}
          r={radius}
          stroke={stroke}
          strokeDasharray={strokeDasharray}
          strokeWidth={strokeWidth}
        />
      ))}
    </Pattern>
  );
}
