import { useEffect, useRef, useCallback } from "react";

const SKIP_TAGS = new Set(["HTML", "BODY"]);
const OVERLAY_ID = "review-pin-placement-overlay";
const HIGHLIGHT_STYLE = "2px solid #7c3aed";

function elementAtPoint(clientX, clientY) {
  return document.elementsFromPoint(clientX, clientY).find(el =>
    !SKIP_TAGS.has(el.tagName) &&
    el.id !== OVERLAY_ID &&
    !el.closest("[data-review-pin-ui], .skiper46-dock")
  );
}

/**
 * PinPlacementOverlay
 *
 * When active, renders a full-screen transparent overlay.
 * - Highlights hovered elements with a purple ring.
 * - On click: calls onPlaced({ el, clientX, clientY }).
 * - On Escape keydown: calls onCancel().
 * - Supports touch tap placement.
 *
 * Props:
 *   active    {boolean}
 *   onPlaced  ({el, clientX, clientY}) => void
 *   onCancel  () => void
 */
export default function PinPlacementOverlay({ active, onPlaced, onCancel }) {
  const overlayRef = useRef(null);
  const highlightedRef = useRef(null);

  const clearHighlight = useCallback(() => {
    if (highlightedRef.current) {
      highlightedRef.current.style.outline = "";
      highlightedRef.current.style.outlineOffset = "";
      highlightedRef.current = null;
    }
  }, []);

  const highlightElement = useCallback(
    (el) => {
      if (!el || SKIP_TAGS.has(el.tagName) || el.id === OVERLAY_ID) return;
      if (el === highlightedRef.current) return;
      clearHighlight();
      el.style.outline = HIGHLIGHT_STYLE;
      el.style.outlineOffset = "2px";
      highlightedRef.current = el;
    },
    [clearHighlight]
  );

  useEffect(() => {
    if (!active) {
      clearHighlight();
      return;
    }

    const overlay = overlayRef.current;

    const handleMouseMove = (e) => {
      // Temporarily hide overlay to find element beneath it
      if (overlay) overlay.style.pointerEvents = "none";
      const el = elementAtPoint(e.clientX, e.clientY);
      if (overlay) overlay.style.pointerEvents = "auto";
      if (el && !SKIP_TAGS.has(el.tagName) && el.id !== OVERLAY_ID) {
        highlightElement(el);
      }
    };

    const handleClick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (overlay) overlay.style.pointerEvents = "none";
      const el = elementAtPoint(e.clientX, e.clientY);
      if (overlay) overlay.style.pointerEvents = "auto";
      clearHighlight();
      if (el && !SKIP_TAGS.has(el.tagName) && el.id !== OVERLAY_ID) {
        onPlaced({ el, clientX: e.clientX, clientY: e.clientY });
      }
    };

    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        clearHighlight();
        onCancel();
      }
    };

    const handleTouchStart = (e) => {
      const touch = e.touches[0];
      if (!touch) return;
      e.preventDefault();
      if (overlay) overlay.style.pointerEvents = "none";
      const el = elementAtPoint(touch.clientX, touch.clientY);
      if (overlay) overlay.style.pointerEvents = "auto";
      clearHighlight();
      if (el && !SKIP_TAGS.has(el.tagName) && el.id !== OVERLAY_ID) {
        onPlaced({ el, clientX: touch.clientX, clientY: touch.clientY });
      }
    };

    const overlayEl = overlay;
    overlayEl?.addEventListener("mousemove", handleMouseMove);
    overlayEl?.addEventListener("click", handleClick, true);
    overlayEl?.addEventListener("touchstart", handleTouchStart, { passive: false });
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      overlayEl?.removeEventListener("mousemove", handleMouseMove);
      overlayEl?.removeEventListener("click", handleClick, true);
      overlayEl?.removeEventListener("touchstart", handleTouchStart);
      document.removeEventListener("keydown", handleKeyDown);
      clearHighlight();
    };
  }, [active, highlightElement, clearHighlight, onPlaced, onCancel]);

  if (!active) return null;

  return (
    <div
      id={OVERLAY_ID}
      ref={overlayRef}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9900,
        cursor: "crosshair",
        background: "transparent",
        WebkitTapHighlightColor: "transparent",
      }}
    />
  );
}

export { PinPlacementOverlay };
