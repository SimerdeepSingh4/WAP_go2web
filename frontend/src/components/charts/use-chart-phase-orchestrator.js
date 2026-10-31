"use client";;
import { useCallback, useEffect, useState } from "react";
import { resolveRestingChartPhase } from "./chart-phase";

/**
 * Phase the reveal starts from on mount (or the resting phase when skipped).
 * A zero-duration reveal starts at rest: passing through "revealing" would
 * only cost a timer-driven re-render after the first paint.
 */
function resolveInitialChartPhase(chartStatus, skipEnterReveal, animationDuration) {
  if (chartStatus === "ready" && !skipEnterReveal && animationDuration > 0) {
    return "revealing";
  }
  return resolveRestingChartPhase(chartStatus);
}

/** Series data plotted for a phase: skeleton while loading / exiting. */
function resolvePlotData(chartPhase, chartStatus, skeletonData, targetData) {
  if (chartPhase === "exiting") {
    return skeletonData;
  }
  if (chartPhase === "loading" && chartStatus === "loading") {
    return skeletonData;
  }
  return targetData;
}

function phaseInputsEqual(a, b) {
  return (
    a.chartStatus === b.chartStatus &&
    a.chartPhase === b.chartPhase &&
    a.animationDuration === b.animationDuration &&
    a.revealSignature === b.revealSignature &&
    a.skipEnterReveal === b.skipEnterReveal
  );
}

/** loading ↔ ready status flip: the phase to enter, or null when unchanged. */
function resolveStatusTransition(prevStatus, chartStatus, animationDuration, yDomainTweenDuration) {
  if (chartStatus === "ready" && prevStatus === "loading") {
    if (animationDuration > 0) {
      return { phase: "exiting", conceal: false };
    }
    return {
      phase: yDomainTweenDuration <= 0 ? "revealing" : "gridTweenReady",
      conceal: false,
    };
  }
  if (chartStatus === "loading" && prevStatus === "ready") {
    if (animationDuration > 0) {
      return { phase: "exitingReady", conceal: true };
    }
    return {
      phase: yDomainTweenDuration <= 0 ? "loading" : "gridTweenLoading",
      conceal: false,
    };
  }
  return null;
}

/** Motion replay (Studio motion URL state / duration change) while resting. */
function shouldReplayReveal(prev, next) {
  if (next.skipEnterReveal || next.chartStatus !== "ready") {
    return false;
  }
  if (next.chartPhase !== "ready") {
    return false;
  }
  return (
    prev.animationDuration !== next.animationDuration ||
    prev.revealSignature !== next.revealSignature ||
    prev.skipEnterReveal !== next.skipEnterReveal
  );
}

/**
 * Pure transition for a change in inputs (props or the phase itself) —
 * mirrors the former status / replay / reveal-epoch effects.
 */
function resolvePhaseTransition(prev, next, yDomainTweenDuration) {
  let nextPhase = next.chartPhase;
  let resetLoaded = false;
  let bumpConceal = false;

  if (prev.chartStatus === next.chartStatus) {
    if (shouldReplayReveal(prev, next)) {
      nextPhase = "revealing";
      resetLoaded = true;
    }
  } else {
    const status = resolveStatusTransition(
      prev.chartStatus,
      next.chartStatus,
      next.animationDuration,
      yDomainTweenDuration
    );
    if (status) {
      nextPhase = status.phase;
      resetLoaded = true;
      bumpConceal = status.conceal;
    }
  }

  // Entering (or re-timing) the reveal starts a new reveal epoch.
  const bumpReveal =
    nextPhase === "revealing" &&
    (prev.chartPhase !== "revealing" ||
      nextPhase !== next.chartPhase ||
      prev.animationDuration !== next.animationDuration);

  return { nextPhase, resetLoaded, bumpConceal, bumpReveal };
}

/**
 * Visual lifecycle state machine for time-series charts.
 *
 * Transitions driven by props (status flips, motion replays) are applied
 * during render with the "store previous props in state" pattern instead of
 * `useEffect` + `setState`, so each transition costs one render rather than a
 * commit followed by a cascading re-render (React Compiler
 * `react-hooks/set-state-in-effect`). Transitions driven by animations
 * (`notify*`) use functional updates, so no ref mirrors of the phase are read
 * during render.
 */
export function useChartPhaseOrchestrator({
  chartStatus,
  targetData,
  skeletonData,
  animationDuration,
  yDomainTweenDuration,
  revealSignature = "",
  skipEnterReveal = false
}) {
  const [chartPhase, setChartPhase] = useState(() =>
    resolveInitialChartPhase(chartStatus, skipEnterReveal, animationDuration));
  const [revealEpoch, setRevealEpoch] = useState(() =>
    chartStatus === "ready" && !skipEnterReveal ? 1 : 0
  );
  const [concealEpoch, setConcealEpoch] = useState(0);
  const [isLoaded, setIsLoaded] = useState(
    () => chartStatus === "ready" && (skipEnterReveal || animationDuration <= 0)
  );

  // Previous inputs — compared during render to derive transitions.
  const [prev, setPrev] = useState({
    chartStatus,
    chartPhase,
    animationDuration,
    revealSignature,
    skipEnterReveal,
  });

  const current = {
    chartStatus,
    chartPhase,
    animationDuration,
    revealSignature,
    skipEnterReveal,
  };
  if (!phaseInputsEqual(prev, current)) {
    const transition = resolvePhaseTransition(
      prev,
      current,
      yDomainTweenDuration
    );
    if (transition.resetLoaded) {
      setIsLoaded(false);
    }
    if (transition.bumpConceal) {
      setConcealEpoch((epoch) => epoch + 1);
    }
    if (transition.bumpReveal) {
      setRevealEpoch((epoch) => epoch + 1);
    }
    if (transition.nextPhase !== chartPhase) {
      setChartPhase(transition.nextPhase);
    }
    setPrev({ ...current, chartPhase: transition.nextPhase });
  }

  const plotData = resolvePlotData(
    chartPhase,
    chartStatus,
    skeletonData,
    targetData
  );

  /** Loading pulse exit finished — tween grid to ready spacing next. */
  const notifyLoadingPulseComplete = useCallback(() => {
    setChartPhase((phase) => (phase === "exiting" ? "gridTweenReady" : phase));
  }, []);

  /** Ready series conceal finished — tween grid to loading spacing next. */
  const notifyRevealConcealComplete = useCallback(() => {
    setChartPhase((phase) =>
      phase === "exitingReady" ? "gridTweenLoading" : phase
    );
  }, []);

  /** Grid tween finished — enter the next resting phase. */
  const notifyYDomainTweenComplete = useCallback(() => {
    setChartPhase((phase) => {
      if (phase === "gridTweenLoading") {
        return "loading";
      }
      if (phase === "gridTweenReady") {
        return "revealing";
      }
      return phase;
    });
  }, []);

  // Reveal timer — the only async transition owned by this hook.
  useEffect(() => {
    if (chartPhase !== "revealing") {
      return;
    }
    const timer = window.setTimeout(
      () => {
        setChartPhase("ready");
        setIsLoaded(true);
      },
      Math.max(0, animationDuration)
    );
    return () => window.clearTimeout(timer);
  }, [animationDuration, chartPhase]);

  return {
    chartPhase,
    plotData,
    revealEpoch,
    concealEpoch,
    isLoaded,
    notifyLoadingPulseComplete,
    notifyRevealConcealComplete,
    notifyYDomainTweenComplete,
  };
}
