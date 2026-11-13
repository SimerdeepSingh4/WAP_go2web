import { motion, useReducedMotion } from "motion/react";
import { ArrowRight, FileSpreadsheet, Trash2, Users } from "lucide-react";
import { cn } from "@/lib/utils";

const FOLDER_SHAPE = "M0 16 a16,16 0 0 1 16,-16 h245 c26.6,0 59.3,59 76,59 h147 a32,32 0 0 1 32,32 v161 a16,16 0 0 1 -16,16 H16 a16,16 0 0 1 -16,-16 Z";
const SPRING = { type: "spring", stiffness: 260, damping: 26, mass: 0.9 };
const CARD_VARIANTS = { rest: { y: 0 }, hover: { y: -8 }, tap: { y: -4, scale: 0.99 } };
const PANEL_VARIANTS = { rest: { y: "0%" }, hover: { y: "8%" } };
const SHEET_VARIANTS = { rest: { scale: 1 }, hover: { scale: 1.07 } };

export default function ContactFolderCard({ title, subtitle, resellerName = "", hasSourceUser = false, count = 0, previewNumbers = [], onOpen, onDelete, className }) {
  const reduceMotion = useReducedMotion();
  const openLabel = `Open ${title}, ${count} saved ${count === 1 ? "number" : "numbers"}${resellerName ? `, reseller ${resellerName}` : ""}`;

  return (
    <motion.div
      role="group"
      aria-label={`${title} contact folder`}
      initial="rest"
      animate="rest"
      whileHover={reduceMotion ? undefined : "hover"}
      whileFocus={reduceMotion ? undefined : "hover"}
      whileTap={reduceMotion ? undefined : "tap"}
      variants={reduceMotion ? undefined : CARD_VARIANTS}
      transition={SPRING}
      style={{ position: "relative", width: "100%" }}
      className={cn("min-w-0", className)}
    >
      <button
        type="button"
        onClick={onOpen}
        aria-label={openLabel}
        style={{ position: "relative", isolation: "isolate", display: "block", width: "100%", padding: "72px 0 0", overflow: "hidden", border: 0, borderRadius: 20, background: "transparent" }}
        className="min-w-0 cursor-pointer text-left font-sans text-card-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4"
      >
        <motion.div
          aria-hidden="true"
          variants={reduceMotion ? undefined : SHEET_VARIANTS}
          transition={SPRING}
          style={{ position: "absolute", left: 0, right: 0, top: 0, height: 128, zIndex: 1, overflow: "hidden", transformOrigin: "50% 100%", borderRadius: 20, border: "1px solid var(--border, #e5e5e5)", background: "var(--card, #ffffff)" }}
        >
          <div className="flex h-7 items-center gap-1.5 border-b border-border px-2.5">
            <FileSpreadsheet className="size-3.5 shrink-0 text-primary" strokeWidth={1.7} />
            <span className="min-w-0 flex-1 truncate text-[10px] font-semibold">{title} contacts</span>
            <span className="text-[9px] text-muted-foreground">.xlsx</span>
          </div>
          <table className="w-full table-fixed border-collapse font-mono text-[10px] leading-none text-muted-foreground">
            <colgroup><col className="w-6" /><col /><col className="w-16" /></colgroup>
            <thead><tr className="h-4 bg-muted/50"><th className="border-r border-b border-border" /><th className="border-r border-b border-border text-center font-normal">A</th><th className="border-b border-border text-center font-normal">B</th></tr></thead>
            <tbody>
              <tr className="h-5"><td className="border-r border-b border-border bg-muted/40 text-center">1</td><td className="border-r border-b border-border bg-accent/50 px-2 font-sans font-semibold text-card-foreground">Phone number</td><td className="border-b border-border bg-accent/50 px-2 font-sans font-semibold text-card-foreground">Status</td></tr>
              {Array.from({ length: 2 }, (_, index) => (
                <tr key={index} className="h-[22px]">
                  <td className="border-r border-b border-border bg-muted/40 text-center text-[9px]">{index + 2}</td>
                  <td className="truncate border-r border-b border-border px-2 text-card-foreground">{previewNumbers[index] || "\u00a0"}</td>
                  <td className="border-b border-border px-2 font-sans text-[9px]">{previewNumbers[index] ? "Saved" : "\u00a0"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </motion.div>

        <div style={{ position: "relative", zIndex: 2 }}>
          <motion.div
            variants={reduceMotion ? undefined : PANEL_VARIANTS}
            transition={SPRING}
            style={{ position: "absolute", inset: 0, zIndex: 0, pointerEvents: "none" }}
          >
            <svg aria-hidden="true" viewBox="0 0 516 268" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, display: "block", width: "100%", height: "100%" }}>
              <path d={FOLDER_SHAPE} fill="var(--muted, #f5f5f5)" stroke="var(--border, #e5e5e5)" strokeWidth="1" />
            </svg>
            <div style={{ position: "relative", padding: 16 }}>
              <span title={title} className="block max-w-[50%] truncate text-base font-semibold leading-5 tracking-tight">{title}</span>
              <span title={subtitle} className="mt-1 block truncate text-xs leading-[18px] text-muted-foreground">{subtitle}</span>
              <span title={resellerName || undefined} className="mt-2 block truncate text-[11px] leading-4 text-muted-foreground">
                {resellerName ? <>Reseller: <span className="font-medium text-card-foreground">{resellerName}</span></> : hasSourceUser ? "Direct account" : "Saved by admin"}
              </span>
            </div>
          </motion.div>

          {/* Reserve the same details height while keeping the footer stationary. */}
          <div style={{ position: "relative", zIndex: 1, padding: 16 }}>
            <div aria-hidden="true" style={{ height: 66 }} />
            <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-3">
              <span className="inline-flex min-w-0 items-center gap-1.5 text-[11px]">
                <Users aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" strokeWidth={1.6} />
                <span className="truncate"><span className="font-semibold tabular-nums">{count.toLocaleString()}</span> saved {count === 1 ? "number" : "numbers"}</span>
              </span>
              <span className="inline-flex shrink-0 items-center gap-1.5">
                {onDelete && <span aria-hidden="true" style={{ width: 28, height: 28 }} />}
                <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, width: 100, height: 32, borderRadius: 6, background: "var(--primary, #00875a)", color: "var(--primary-foreground, #ffffff)", fontSize: 11, fontWeight: 500 }}>Open folder<ArrowRight aria-hidden="true" className="size-3" strokeWidth={1.8} /></span>
              </span>
            </div>
          </div>
        </div>
      </button>

      {onDelete && <button
        type="button"
        onClick={onDelete}
        aria-label={`Delete ${title} folder`}
        title="Delete folder"
        style={{ position: "absolute", zIndex: 3, right: 122, bottom: 18, display: "grid", placeItems: "center", width: 28, height: 28, padding: 0, border: 0, borderRadius: 6, background: "transparent" }}
        className="cursor-pointer text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:text-destructive"
      ><Trash2 aria-hidden="true" className="size-3.5" strokeWidth={1.7} /></button>}
    </motion.div>
  );
}
