import { useLayoutEffect, useMemo, useRef } from "react";
import { useReducedMotion } from "motion/react";

const DURATION_MS = 650;

export default function AnimatedMetricValue({ value, signDisplay = "auto" }) {
  const element = useRef(null);
  const displayed = useRef(0);
  const previousTarget = useRef(0);
  const reducedMotion = useReducedMotion();
  const formatter = useMemo(() => new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 2,
    signDisplay,
  }), [signDisplay]);

  useLayoutEffect(() => {
    const node = element.current;
    if (!node) return;
    const from = displayed.current;
    const precision = Number.isInteger(value) && Number.isInteger(previousTarget.current) ? 1 : 100;
    previousTarget.current = value;

    if (reducedMotion || from === value) {
      displayed.current = value;
      node.textContent = formatter.format(value);
      return;
    }

    let frame;
    const started = performance.now();
    node.textContent = formatter.format(from);
    function tick(now) {
      const progress = Math.min(1, Math.max(0, (now - started) / DURATION_MS));
      const eased = 1 - (1 - progress) ** 3;
      const next = progress === 1 ? value : Math.round((from + (value - from) * eased) * precision) / precision;
      displayed.current = next;
      node.textContent = formatter.format(next);
      if (progress < 1) frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    // Retarget from the number currently on screen when another update arrives.
    return () => cancelAnimationFrame(frame);
  }, [value, reducedMotion, formatter]);

  return <span className="overview-metric-counter">
    <span ref={element} aria-hidden="true">{formatter.format(value)}</span>
    <span className="sr-only">{formatter.format(value)}</span>
  </span>;
}
