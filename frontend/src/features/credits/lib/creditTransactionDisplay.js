import { ArrowUpRight, ArrowDownLeft, ArrowDownRight, ArrowRight, Coins } from "lucide-react";

export function getAccountBalanceAfter(transaction, accountId) {
  if (!accountId || transaction.type === "REQUEST") return null;
  const matches = party => String(party?._id ?? party?.id ?? party) === String(accountId);
  const from = matches(transaction.fromUser);
  const to = matches(transaction.toUser);
  if (to && (transaction.type === "RELEASE" || transaction.type === "REFUND")) return transaction.balanceAfterTo ?? null;
  if (from) return transaction.balanceAfterFrom ?? (to ? transaction.balanceAfterTo : null);
  return to ? transaction.balanceAfterTo : null;
}

export function getTransactionNote({ type, notes }) {
  if (type !== "RESERVE" || typeof notes !== "string") return notes;
  return notes.replace(/^Stock reserved for quote (#[a-f\d]{24})$/i, "Credits reserved for quote $1");
}

const legacyPurchaseErrors = new Map([
  ["This credit movement cannot use a purchase or reserved stock.", "This credit movement cannot use a purchase or reserved credits."],
  ["A stock hold or release requires the seller wallet and purchase.", "Reserving or releasing credits requires the seller's wallet and purchase."],
  ["Only the purchase parties may use this seller's stock.", "This account cannot reserve or release the seller's credits."],
  ["The purchase stock has already moved or cannot be held.", "The credits for this purchase have already moved or cannot be reserved."],
]);

export function getCreditPurchaseError(message) {
  return legacyPurchaseErrors.get(message) ?? message.replace(
    /^Your account manager has insufficient credit stock in this category \(Available: (\d+), Requested: (\d+)\)\.$/,
    "Your account manager does not have enough credits in this category. Available: $1. Requested: $2."
  );
}

// Transfers have two sides. The admin ledger represents the platform credit pool.
export function getTransactionDirection(transaction, viewer) {
  switch (transaction.type) {
    case "DEDUCT":
    case "RESERVE":
      return "out";
    case "REFUND":
    case "RELEASE":
      return "in";
    case "REQUEST":
      return "request";
    case "ALLOCATE":
    case "RECLAIM": {
      const { fromUser, toUser } = transaction;
      const viewerId = viewer?._id ?? viewer?.id;
      const matches = party => viewerId != null && String(party?._id ?? party?.id ?? party) === String(viewerId);
      if (matches(fromUser)) return "out";
      if (matches(toUser)) return "in";
      if (viewer?.role === "Super Admin") {
        if (transaction.type === "ALLOCATE" && (!fromUser || fromUser.role === "Super Admin")) return "out";
        if (transaction.type === "RECLAIM" && toUser?.role === "Super Admin") return "in";
      }
      return "transfer";
    }
    default:
      return "neutral";
  }
}

export function getTransactionDisplay(t, viewer) {
  const direction = getTransactionDirection(t, viewer);
  if (direction === "request") return { label: "Credit request", badgeClass: "border-amber-200 bg-amber-50 text-amber-800", icon: Coins };
  if (direction === "transfer") return { label: "Transfer", badgeClass: "border-border bg-muted text-foreground", icon: ArrowRight };

  if (t.type === "ALLOCATE") {
    if (direction === "in") return {
      label: "Credit Received",
      badgeClass: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300",
      icon: ArrowDownLeft,
    };
    return {
      label: viewer?.role === "Super Admin" ? "Credit Added" : "Credit Allocated",
      badgeClass: "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-300",
      icon: ArrowUpRight,
    };
  }
  if (t.type === "DEDUCT") return {
    label: t.category === "NUMBER_FILTERING" ? "Filtering usage" : "Campaign Usage",
    badgeClass: "border-red-200 bg-red-50 text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300",
    icon: ArrowDownRight,
  };
  if (t.type === "REFUND") return {
    label: "Refund",
    badgeClass: "border-cyan-200 bg-cyan-50 text-cyan-800 dark:border-cyan-900/60 dark:bg-cyan-950/40 dark:text-cyan-300",
    icon: ArrowDownLeft,
  };
  if (t.type === "RECLAIM") return {
    label: viewer?.role === "Super Admin" ? "Credit Deducted" : "Reclaimed",
    badgeClass: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300",
    icon: direction === "in" ? ArrowDownLeft : ArrowUpRight,
  };
  return { label: t.type, badgeClass: "border-border bg-muted text-foreground", icon: ArrowRight };
}

export function getCategoryDisplay(category) {
  if (category === "CAMPAIGN") {
    return {
      label: "Campaign Credits",
      shortLabel: "Campaign",
      badgeClass: "border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-900/60 dark:bg-indigo-950/40 dark:text-indigo-300",
    };
  }
  if (category === "NUMBER_FILTERING") {
    return {
      label: "Number Filtering Credits",
      shortLabel: "Filtering",
      badgeClass: "border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-900/60 dark:bg-purple-950/40 dark:text-purple-300",
    };
  }
  return {
    label: "Legacy Credits",
    shortLabel: "Legacy",
    badgeClass: "border-stone-200 bg-stone-50 text-stone-600 dark:border-stone-800 dark:bg-stone-900/40 dark:text-stone-400",
  };
}

export const creditCategoryNames = { CAMPAIGN: "Campaign Credits", NUMBER_FILTERING: "Number Filtering Credits" };
export const creditCategoryField = {
  key: "category", label: "Credit category", required: true,
  options: Object.entries(creditCategoryNames).map(([value, label]) => ({ value, label })),
};
