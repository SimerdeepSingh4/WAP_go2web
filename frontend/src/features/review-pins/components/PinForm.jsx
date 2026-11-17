import { useState, useEffect, useRef } from "react";

const LS_NAME_KEY = "review-pin-tester-name";
const FORM_WIDTH = 280;
const FORM_HEIGHT_EST = 220; // estimated, used for viewport flip logic

/**
 * PinForm — compact floating form rendered near the clicked point.
 *
 * Props:
 *   placement  {{ clientX, clientY, el } | null}
 *   onSave     ({ testerName, description }) => void
 *   onCancel   () => void
 *   isSaving   {boolean}
 */
export default function PinForm({ placement, onSave, onCancel, isSaving }) {
  const [testerName, setTesterName] = useState(
    () => localStorage.getItem(LS_NAME_KEY) ?? ""
  );
  const [description, setDescription] = useState("");
  const nameRef = useRef(null);

  // Focus name field when form opens
  useEffect(() => {
    if (placement) {
      setDescription("");
      setTimeout(() => nameRef.current?.focus(), 50);
    }
  }, [placement]);

  if (!placement) return null;

  const { clientX, clientY } = placement;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // Flip horizontally if too close to right edge
  const flipX = clientX + FORM_WIDTH + 16 > vw;
  // Flip vertically if too close to bottom edge
  const flipY = clientY + FORM_HEIGHT_EST + 16 > vh;

  const left = flipX ? Math.max(8, clientX - FORM_WIDTH - 8) : clientX + 16;
  const top = flipY ? Math.max(8, clientY - FORM_HEIGHT_EST) : clientY + 8;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!testerName.trim() || !description.trim()) return;
    localStorage.setItem(LS_NAME_KEY, testerName.trim());
    onSave({ testerName: testerName.trim(), description: description.trim() });
  };

  return (
    <div
      style={{
        position: "fixed",
        left,
        top,
        width: FORM_WIDTH,
        zIndex: 9950,
      }}
      className="bg-neutral-900 text-neutral-100 border border-neutral-700 rounded-xl shadow-2xl p-4"
      // Prevent clicks inside the form from bubbling to the overlay
      onClick={(e) => e.stopPropagation()}
    >
      <p className="text-xs font-semibold text-purple-400 mb-3 tracking-wide uppercase">
        📌 New Pin
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div>
          <label className="block text-xs text-neutral-400 mb-1">Your name</label>
          <input
            ref={nameRef}
            type="text"
            value={testerName}
            onChange={(e) => setTesterName(e.target.value)}
            placeholder="Tester name"
            maxLength={120}
            required
            className="w-full bg-neutral-800 border border-neutral-600 rounded-lg px-3 py-1.5 text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>

        <div>
          <label className="block text-xs text-neutral-400 mb-1">
            What should change?
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe the issue or suggestion…"
            rows={3}
            maxLength={2000}
            required
            className="w-full bg-neutral-800 border border-neutral-600 rounded-lg px-3 py-1.5 text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
          />
        </div>

        <div className="flex gap-2 justify-end pt-1">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSaving}
            className="px-3 py-1.5 text-xs rounded-lg bg-neutral-700 hover:bg-neutral-600 text-neutral-200 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSaving || !testerName.trim() || !description.trim()}
            className="px-3 py-1.5 text-xs rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-semibold transition-colors disabled:opacity-50 flex items-center gap-1.5"
          >
            {isSaving ? (
              <>
                <span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Saving…
              </>
            ) : (
              "Save"
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

export { PinForm };
