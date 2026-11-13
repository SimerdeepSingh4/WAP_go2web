export const DEFAULT_CHART_STATUS = "ready";

/** Default Y-domain tween when transitioning loading ↔ ready (ms). */
export const DEFAULT_Y_DOMAIN_TWEEN_MS = 500;

/** Relative domain delta below which Y tween may be skipped (see plan). */
export const Y_DOMAIN_TWEEN_SKIP_THRESHOLD = 0.02;

/** Resting phase for a given status before transition orchestration runs. */
export function resolveRestingChartPhase(status) {
  return status === "loading" ? "loading" : "ready";
}

export function isChartInteractionPhase(phase) {
  return phase === "ready";
}

export const DEFAULT_CHART_LIFECYCLE = {
  chartPhase: "ready",
  chartStatus: "ready",
  loadingLabel: undefined,
  yDomainTweenDuration: DEFAULT_Y_DOMAIN_TWEEN_MS,
  yDomainSkeletonByAxis: { left: [0, 100] },

  // No target: charts without a y-domain tween (bar, candlestick, scatter,
  // live line) have no settled domain distinct from the live scale, so
  // `useSettledYScale` must fall back to it. A placeholder here made `YAxis`
  // tick 0–100 on top of the real data scale.
  yDomainTargetByAxis: {}
};
