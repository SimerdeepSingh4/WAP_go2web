import { useEffect, useRef, useState } from "react";

export function findPathLengthAtX(path, pathLength, targetX) {
  if (!path || pathLength === 0) {
    return 0;
  }
  let low = 0;
  let high = pathLength;
  const tolerance = 0.5;

  while (high - low > tolerance) {
    const mid = (low + high) / 2;
    const point = path.getPointAtLength(mid);
    if (point.x < targetX) {
      low = mid;
    } else {
      high = mid;
    }
  }
  return (low + high) / 2;
}

const EMPTY_METRICS = { pathD: null, pathLength: 0 };

/**
 * Caller passes the references that drive the rendered path (renderData,
 * innerWidth, etc.) as `deps`. A stringified summary like
 * `${renderData.length}:${innerWidth}` is *not* safe here — same-length
 * in-place mutations of `renderData` keep the summary identical, so the
 * effect would never re-fire and `pathD`/`pathLength` would stay frozen on
 * the previous geometry (the area fill repaints from `renderData` directly
 * and would diverge from the stroke).
 */
export function usePathStrokeMetrics(
  pathRef,
  deps,
  /**
   * Skip measuring while nothing reads the metrics (no dash tail / loading
   * pulse): `getTotalLength()` on a long path plus the follow-up render is
   * real work on every data update. Flipping to true re-measures.
   */
  enabled = true
) {
  const [metrics, setMetrics] = useState(EMPTY_METRICS);
  const measuredInputs = useRef(null);

  // Callers supply the current inputs as an array. Compare its members before
  // measuring so a newly allocated list does not trigger expensive DOM work.
  useEffect(() => {
    const path = pathRef.current;
    const inputs = [enabled, path, ...deps];
    const previous = measuredInputs.current;
    if (
      previous &&
      previous.length === inputs.length &&
      inputs.every((value, index) => Object.is(value, previous[index]))
    ) return;
    measuredInputs.current = inputs;
    if (!(enabled && path)) {
      return;
    }
    const d = path.getAttribute("d");
    const len = d ? path.getTotalLength() : 0;
    setMetrics((prev) =>
      prev.pathD === d && prev.pathLength === len
        ? prev
        : { pathD: d, pathLength: len }
    );
  }, [pathRef, enabled, deps]);

  return metrics;
}

export function resolveDashTailBounds(dashFromIndex, dataLength) {
  return (
    dashFromIndex != null &&
    dashFromIndex >= 0 &&
    dashFromIndex < dataLength - 1
  );
}

export function resolveDashStartX(data, dashFromIndex, xScale, xAccessor) {
  const dashFromPoint = data[dashFromIndex];
  if (!dashFromPoint) {
    return 0;
  }
  return xScale(xAccessor(dashFromPoint)) ?? 0;
}
