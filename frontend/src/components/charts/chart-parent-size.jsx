"use client";;
import { useEffect, useLayoutEffect, useRef, useState } from "react";

/** `useLayoutEffect` in the browser, `useEffect` on the server (no SSR warning). */
export const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

const ZERO_SIZE = { width: 0, height: 0 };

/**
 * Layout size of `element`, unaffected by CSS transforms. Fractional like
 * `ResizeObserver`'s `contentRect`, so the observer's first notification
 * matches and doesn't trigger a second render.
 */
function readElementSize(element) {
  const style = getComputedStyle(element);
  const width = Number.parseFloat(style.width);
  const height = Number.parseFloat(style.height);
  return {
    width: Number.isFinite(width) ? width : element.clientWidth,
    height: Number.isFinite(height) ? height : element.clientHeight,
  };
}

const sameSize = (a, b) =>
  a.width === b.width && a.height === b.height;

/**
 * visx `debounce(fn, wait, { leading: true })`: fires on the first call, then
 * once more with the latest argument `wait` ms after the last call (only if
 * there were calls after the leading one).
 */
function leadingDebounce(fn, wait) {
  let timeout;
  let pending = null;
  const debounced = (arg) => {
    if (timeout === undefined) {
      fn(arg);
      pending = null;
    } else {
      pending = { arg };
    }
    clearTimeout(timeout);
    timeout = setTimeout(() => {
      timeout = undefined;
      if (pending !== null) {
        fn(pending.arg);
        pending = null;
      }
    }, wait);
  };
  debounced.cancel = () => {
    clearTimeout(timeout);
    timeout = undefined;
    pending = null;
  };
  return debounced;
}

/**
 * Tracks an element's size. The first measurement happens in a layout effect,
 * so the sized render commits before the browser paints its first frame
 * (no blank frame while a `ResizeObserver` round-trips). Later changes come
 * from a `ResizeObserver`; `debounceTime` coalesces bursts after an
 * immediate leading update. `timing: "observer"` keeps visx `useParentSize`
 * behaviour instead (see {@link ElementSizeOptions}).
 */
export function useElementSize(
  ref,
  debounceTime = 0,
  {
    timing = "layout"
  } = {}
) {
  const [size, setSize] = useState(ZERO_SIZE);

  // visx useParentSize: passive effect, rAF-deferred observer callbacks.
  useEffect(() => {
    const element = ref.current;
    if (
      timing !== "observer" ||
      !element ||
      typeof ResizeObserver === "undefined"
    ) {
      return;
    }
    const resize = leadingDebounce((next) => {
      setSize((prev) => (sameSize(prev, next) ? prev : next));
    }, debounceTime);
    let frame = 0;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        frame = requestAnimationFrame(() => resize({ width, height }));
      }
    });
    observer.observe(element);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      resize.cancel();
    };
  }, [ref, debounceTime, timing]);

  useIsomorphicLayoutEffect(() => {
    const element = ref.current;
    if (timing !== "layout" || !element) {
      return;
    }
    const apply = () => {
      const next = readElementSize(element);
      setSize((prev) => (sameSize(prev, next) ? prev : next));
    };
    apply();

    if (typeof ResizeObserver === "undefined") {
      return;
    }
    let timeout = null;
    let trailing = false;
    const observer = new ResizeObserver(() => {
      if (debounceTime <= 0) {
        apply();
        return;
      }
      if (timeout !== null) {
        trailing = true;
        return;
      }
      apply();
      const flush = () => {
        if (trailing) {
          trailing = false;
          apply();
          timeout = setTimeout(flush, debounceTime);
          return;
        }
        timeout = null;
      };
      timeout = setTimeout(flush, debounceTime);
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
      if (timeout !== null) {
        clearTimeout(timeout);
      }
    };
  }, [ref, debounceTime, timing]);

  return size;
}

/**
 * Drop-in for visx `<ParentSize>` without its `overflow: hidden` measuring
 * layer, so tooltips, markers, and strokes at the chart edge aren't clipped.
 * Measures before first paint (see {@link useElementSize}).
 */
export function ParentSize({
  children,
  className,
  debounceTime,
  style
}) {
  const parentRef = useRef(null);
  const { width, height } = useElementSize(parentRef, debounceTime ?? 300);
  return (
    <div
      className={className}
      style={{ position: "relative", width: "100%", height: "100%", ...style }}
    >
      <div ref={parentRef} style={{ position: "absolute", inset: 0 }}>
        {children({ width, height })}
      </div>
    </div>
  );
}
