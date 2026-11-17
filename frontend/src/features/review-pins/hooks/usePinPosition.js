import { useLayoutEffect, useState } from "react";
import { computeMarkerPosition, resolveElement } from "../lib/pinAnchor";

export function pinPositionStyle(position) {
  return {
    "--review-pin-left": `${position.left}px`,
    "--review-pin-top": `${position.top}px`,
    "--review-pin-region-left": `${position.region?.left ?? 0}px`,
    "--review-pin-region-top": `${position.region?.top ?? 0}px`,
    "--review-pin-region-width": `${position.region?.width ?? 0}px`,
    "--review-pin-region-height": `${position.region?.height ?? 0}px`,
    "--review-pin-region-radius": position.region?.borderRadius || "0px",
    "--review-pin-clip": position.clipPath || "none",
    "--review-pin-visibility": position.visible === false ? "hidden" : "visible",
    "--review-pin-marker-visibility": position.markerVisible === false ? "hidden" : "visible",
  };
}

// Page coordinates let the browser move annotations with normal document scrolling.
export function usePinPosition(pin, layerRef) {
  const [position, setPosition] = useState(null);

  useLayoutEffect(() => {
    let frame;
    let observedElement;
    const resizeObserver = new ResizeObserver(scheduleUpdate);

    function update() {
      const element = resolveElement(pin?.elementSelector).el;
      if (element !== observedElement) {
        if (observedElement) resizeObserver.unobserve(observedElement);
        if (element) resizeObserver.observe(element);
        observedElement = element;
      }
      const computed = computeMarkerPosition(pin);
      const next = computed && { ...computed, scrollX: window.scrollX, scrollY: window.scrollY };
      if (next && layerRef?.current) {
        // Nested scrollers and sticky targets need a fresh measurement. Apply it
        // in the scroll event so their visuals never wait for a React render.
        for (const [property, value] of Object.entries(pinPositionStyle(next))) {
          layerRef.current.style.setProperty(property, value);
        }
      }
      setPosition(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
    }

    function scheduleUpdate() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    }

    const mutationObserver = new MutationObserver(records => {
      // Ignore our own overlay updates to avoid a measurement/render loop.
      if (records.some(record => {
        const target = record.target instanceof Element ? record.target : record.target.parentElement;
        return !target?.closest("[data-review-pin-ui]");
      })) scheduleUpdate();
    });
    resizeObserver.observe(document.documentElement);
    mutationObserver.observe(document.documentElement, {
      subtree: true, childList: true, characterData: true, attributes: true,
    });
    // Capture also covers scrolling inside tables, sidebars and other containers.
    window.addEventListener("scroll", update, { capture: true, passive: true });
    window.addEventListener("resize", scheduleUpdate, { passive: true });
    update();

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", scheduleUpdate);
    };
  }, [pin, layerRef]);

  return position;
}
