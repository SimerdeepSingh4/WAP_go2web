import { createPortal } from "react-dom";
import { useRef } from "react";
import { pinPositionStyle, usePinPosition } from "../hooks/usePinPosition";
import "./review-pin-marker.css";

/** Persistent outline with a numbered badge overlapping the selected area's border. */
export default function PinMarker({ pin, number, onClick }) {
  const layerRef = useRef(null);
  const position = usePinPosition(pin, layerRef);
  if (!position) return null;

  const { region, anchorLost } = position;
  const title = anchorLost
    ? `Pin ${number}: location unavailable — position approximated`
    : `Pin ${number}: ${pin.description || "Review this area"}${pin.status === "resolved" ? ` — resolved by ${pin.resolvedByName}` : ""}`;

  return createPortal(
    <div ref={layerRef} data-review-pin-ui className="review-pin-annotation" data-resolved={pin.status === "resolved" || undefined} data-lost={anchorLost || undefined} style={pinPositionStyle(position)}>
      {region && <div
        className="review-pin-highlight"
        aria-hidden="true"
      />}
      <button
        type="button"
        className="review-pin-marker"
        title={title}
        aria-label={title}
        onClick={() => onClick?.(pin)}
      >
        {number}
      </button>
    </div>,
    document.body
  );
}

export { PinMarker };
