import { useEffect } from "react";
import { FolderPlus, X, CheckCircle2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function AddCategoryModal({
  isOpen,
  onClose,
  name,
  onNameChange,
  billing,
  onBillingChange,
  onSubmit,
}) {
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-cat-title"
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4"
      onClick={onClose}
    >
      <form
        className="w-full max-w-md bg-background rounded-xl border border-border p-5 shadow-2xl space-y-5"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        <div className="flex items-center justify-between">
          <h3 id="add-cat-title" className="text-sm font-semibold text-foreground flex items-center gap-2">
            <FolderPlus className="size-4 text-[#000080]" />
            Add a status bucket
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-muted-foreground hover:text-foreground cursor-pointer"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="cat-name" className="text-xs font-medium text-foreground">
            Name
          </label>
          <Input
            id="cat-name"
            autoFocus
            placeholder="e.g. Network timeout, Banned by Meta"
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            className="text-xs"
          />
        </div>

        <fieldset className="space-y-1.5">
          <legend className="text-xs font-medium text-foreground mb-1.5">Billing rule</legend>
          <div className="grid grid-cols-2 gap-2">
            {[
              {
                key: "deduct",
                icon: CheckCircle2,
                title: "Deduct credit",
                desc: "Numbers stay billed",
                on: "border-emerald-500 bg-emerald-50",
                ic: "text-emerald-600",
              },
              {
                key: "refund",
                icon: RotateCcw,
                title: "Refund credit",
                desc: "Credits return to the wallet",
                on: "border-rose-500 bg-rose-50",
                ic: "text-rose-600",
              },
            ].map((o) => (
              <button
                key={o.key}
                type="button"
                aria-pressed={billing === o.key}
                onClick={() => onBillingChange(o.key)}
                className={`p-3 rounded-lg border text-left cursor-pointer transition-colors ${
                  billing === o.key ? o.on : "border-border hover:bg-muted/50"
                }`}
              >
                <p className="text-xs font-medium text-foreground flex items-center gap-1.5">
                  <o.icon className={`size-3.5 ${o.ic}`} />
                  {o.title}
                </p>
                <p className="text-[11px] text-muted-foreground mt-1">{o.desc}</p>
              </button>
            ))}
          </div>
        </fieldset>

        <div className="flex justify-end gap-2 pt-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            className="text-xs"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            size="sm"
            className="text-xs bg-[#000080] hover:bg-[#000080]/90 text-white font-medium"
          >
            Add bucket
          </Button>
        </div>
      </form>
    </div>
  );
}

