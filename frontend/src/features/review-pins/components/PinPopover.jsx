import { useId, useState } from "react";
import { usePinPosition } from "../hooks/usePinPosition";
import { dateTime } from "@/lib/format";

const POPOVER_WIDTH = 320;
const POPOVER_HEIGHT_EST = 300;

/**
 * PinPopover — small popover shown when a marker is clicked.
 *
 * Props:
 *   pin       {object}
 *   onClose   () => void
 *   onDelete  (pin) => void
 *   canDelete {boolean}
 */
export default function PinPopover({ pin, onClose, onDelete, canDelete, isDeleting = false, onResolve, resolverName = "", isResolving = false, resolveError }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [askingName, setAskingName] = useState(false);
  const [name, setName] = useState(resolverName);
  const nameId = useId();
  const computed = usePinPosition(pin);

  if (!pin || !computed) return null;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // Convert page coordinates to viewport coordinates.
  const viewportX = computed.left - computed.scrollX;
  const viewportY = computed.top - computed.scrollY;
  const flipX = viewportX + POPOVER_WIDTH + 24 > vw;
  const flipY = viewportY + POPOVER_HEIGHT_EST + 24 > vh;
  const pos = {
    left: flipX
      ? Math.max(8, computed.left - POPOVER_WIDTH - 16)
      : computed.left + 20,
    top: flipY
        ? Math.max(computed.scrollY + 8, computed.top - POPOVER_HEIGHT_EST)
      : computed.top + 4,
  };

  const handleDeleteClick = () => {
    if (confirmDelete) {
      onDelete(pin);
    } else {
      setConfirmDelete(true);
    }
  };

  const dateStr = pin.createdAt
    ? dateTime(pin.createdAt)
    : "";

  return (
    <div
      data-review-pin-ui
      className="review-pin-popover bg-neutral-900 text-neutral-100 border border-neutral-700 rounded-xl shadow-2xl p-4"
      style={{
        position: "absolute",
        left: pos.left,
        top: pos.top,
        width: POPOVER_WIDTH,
        maxHeight: "calc(100dvh - 16px)",
        overflowY: "auto",
        zIndex: 9810,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-neutral-100 truncate">
            {pin.testerName}
          </p>
          {dateStr && (
            <p className="text-xs text-neutral-500 mt-0.5">{dateStr}</p>
          )}
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          className="text-neutral-500 hover:text-neutral-200 transition-colors flex-shrink-0 leading-none text-lg"
        >
          ✕
        </button>
      </div>

      {/* Description */}
      <p className="text-sm text-neutral-300 leading-relaxed mb-3 whitespace-pre-wrap break-words">
        {pin.description}
      </p>

      {pin.status === "resolved" ? (
        <div className="mb-3 rounded-lg border border-emerald-700/60 bg-emerald-950/50 p-3 text-xs text-emerald-200" role="status">
          <p className="font-semibold">Resolved by {pin.resolvedByName || "Unknown reviewer"}</p>
          {pin.resolvedAt && <time className="mt-1 block text-emerald-300" dateTime={pin.resolvedAt}>{dateTime(pin.resolvedAt)}</time>}
        </div>
      ) : null}

      {/* Resolving form (asking name) */}
      {pin.status !== "resolved" && onResolve && askingName && (
        <div className="mb-3 border-t border-neutral-700 pt-3">
          <form className="space-y-2.5" onSubmit={event => {
            event.preventDefault();
            if (name.trim() && !isResolving) onResolve(pin, name.trim());
          }}>
            <label className="block text-xs font-medium text-neutral-200" htmlFor={nameId}>Your name</label>
            <input id={nameId} autoFocus autoComplete="name" required maxLength={120}
              value={name} onChange={event => setName(event.target.value)} disabled={isResolving}
              className="w-full rounded-lg border border-neutral-600 bg-neutral-800 px-3 py-2 text-sm text-neutral-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              aria-describedby={`${nameId}-hint`} />
            <p id={`${nameId}-hint`} className="text-[11px] leading-4 text-neutral-400">Remembered for your account on this browser.</p>
            <div className="flex justify-end gap-2">
              <button type="button" disabled={isResolving} onClick={() => setAskingName(false)} className="rounded-lg px-2 py-1.5 text-xs text-neutral-300 disabled:opacity-50">Cancel</button>
              <button type="submit" disabled={isResolving || !name.trim()} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50">{isResolving ? "Resolving…" : "Mark as resolved"}</button>
            </div>
          </form>
          {resolveError && <p role="alert" className="mt-2 text-xs text-red-300">{resolveError}</p>}
        </div>
      )}

      {/* Single-row actions footer: Mark as resolved + Delete */}
      {(!askingName || pin.status === "resolved") && (
        <div className="border-t border-neutral-700 pt-3">
          {pin.status !== "resolved" && onResolve && resolverName && (
            <p className="mb-2 text-[11px] text-neutral-400 truncate">
              Resolving as <span className="font-medium text-neutral-200">{resolverName}</span>
              <button type="button" onClick={() => { setName(resolverName); setAskingName(true); }} className="ml-1 underline underline-offset-2" disabled={isResolving}>Change</button>
            </p>
          )}

          <div className="flex items-center gap-2">
            {pin.status !== "resolved" && onResolve && (
              <button
                type="button"
                disabled={isResolving}
                onClick={() => resolverName ? onResolve(pin, resolverName) : setAskingName(true)}
                className="flex-1 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50 transition-colors whitespace-nowrap text-center"
              >
                {isResolving ? "Resolving…" : "Mark as resolved"}
              </button>
            )}

            {canDelete && (
              <button
                type="button"
                onClick={handleDeleteClick}
                disabled={isDeleting}
                className={`flex-shrink-0 text-xs px-3 py-2 rounded-lg transition-colors font-medium whitespace-nowrap ${
                  confirmDelete
                    ? "bg-red-700 hover:bg-red-600 text-white"
                    : "bg-neutral-800 hover:bg-neutral-700 text-neutral-300 border border-neutral-700"
                } ${pin.status === "resolved" || !onResolve ? "ml-auto" : ""}`}
              >
                {isDeleting ? "Deleting…" : confirmDelete ? "Confirm delete" : "Delete"}
              </button>
            )}
          </div>

          {resolveError && <p role="alert" className="mt-2 text-xs text-red-300">{resolveError}</p>}
        </div>
      )}
    </div>
  );
}

export { PinPopover };
