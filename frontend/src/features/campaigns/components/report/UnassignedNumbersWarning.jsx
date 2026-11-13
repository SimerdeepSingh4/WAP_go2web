import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { number } from "@/lib/format";

export default function UnassignedNumbersWarning({
  isAdmin,
  unassignedNumbers,
  categories,
  onAssignAll,
}) {
  if (!isAdmin || unassignedNumbers.length === 0) return null;

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-start gap-2.5">
        <AlertTriangle className="size-4 text-amber-600 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-amber-900">
            {number(unassignedNumbers.length)} number{unassignedNumbers.length === 1 ? "" : "s"} not in any bucket
          </p>
          <p className="text-xs text-amber-800/80">They won’t be billed or refunded until you place them.</p>
        </div>
      </div>
      {categories[0] && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => onAssignAll(categories[0].id)}
          className="text-xs bg-white border-amber-300 hover:bg-amber-100"
        >
          Assign all to “{categories[0].name}”
        </Button>
      )}
    </div>
  );
}

