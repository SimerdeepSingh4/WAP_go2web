import { area, line } from "d3-shape";

/** `d` of visx `<LinePath data={data} … />`. */
export function linePathD(
  data,
  {
    x,
    y,
    defined,
    curve
  }
) {
  const path = line();
  if (x) {
    path.x(x);
  }
  if (y) {
    path.y(y);
  }
  if (defined) {
    path.defined(defined);
  }
  if (curve) {
    path.curve(curve);
  }
  return path(data) || "";
}

/** `d` of visx `<AreaClosed data={data} … />`. */
export function areaClosedD(
  data,
  {
    x,
    y,
    y0,
    yScale,
    defined,
    curve
  }
) {
  const path = area();
  if (x) {
    path.x(x);
  }
  if (defined) {
    path.defined(defined);
  }
  if (curve) {
    path.curve(curve);
  }
  if (y0 == null) {
    const baseline = yScale?.range()[0];
    if (baseline !== undefined) {
      path.y0(baseline);
    }
  } else if (typeof y0 === "number") {
    path.y0(y0);
  } else {
    path.y0(y0);
  }
  if (y) {
    path.y1(y);
  }
  return path(data) || "";
}

/**
 * The `<path>` visx `LinePath` rendered, minus its `visx-linepath` class:
 * `d`, then `fill` (default `transparent`), then `strokeLinecap="round"` (so a
 * lone defined point between gaps stays visible), then every other prop in
 * the order given. Props that repeat an earlier key keep its position.
 */
export function LinePath({
  d,
  fill = "transparent",
  innerRef,
  ...rest
}) {
  return (
    <path d={d} fill={fill} ref={innerRef} strokeLinecap="round" {...rest} />
  );
}
