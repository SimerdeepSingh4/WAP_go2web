import { ArrowUpRight, ArrowDownLeft, ArrowDownRight, ArrowRight, Coins } from "lucide-react";

export function getTransactionDisplay(t, { allocationReceived } = {}) {
  if(t.type === "REQUEST") return {label:"Credit request",badgeClass:"border-amber-200 bg-amber-50 text-amber-800",amountClass:"text-amber-800 font-medium",sign:"",icon:Coins};
  const isIncomingAllocation = allocationReceived ?? (!t.fromUser || t.fromUser?.role === "Super Admin");

  if (t.type === "ALLOCATE") {
    if (isIncomingAllocation) {
      return {
        label: "Credit Received",
        badgeClass: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300",
        amountClass: "text-emerald-700 dark:text-emerald-400 font-semibold",
        sign: "+",
        icon: ArrowDownLeft,
      };
    } else {
      return {
        label: "Credit Allocated",
        badgeClass: "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-300",
        amountClass: "text-blue-700 dark:text-blue-400 font-semibold",
        sign: "-",
        icon: ArrowUpRight,
      };
    }
  }

  if (t.type === "DEDUCT") {
    return {
      label: "Campaign Usage",
      badgeClass: "border-red-200 bg-red-50 text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300",
      amountClass: "text-red-700 dark:text-red-400 font-semibold",
      sign: "-",
      icon: ArrowDownRight,
    };
  }

  if (t.type === "REFUND") {
    return {
      label: "Refund",
      badgeClass: "border-cyan-200 bg-cyan-50 text-cyan-800 dark:border-cyan-900/60 dark:bg-cyan-950/40 dark:text-cyan-300",
      amountClass: "text-cyan-700 dark:text-cyan-400 font-semibold",
      sign: "+",
      icon: ArrowDownLeft,
    };
  }

  if (t.type === "RECLAIM") {
    return {
      label: "Reclaimed",
      badgeClass: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300",
      amountClass: "text-amber-700 dark:text-amber-400 font-semibold",
      sign: "-",
      icon: ArrowUpRight,
    };
  }

  return {
    label: t.type,
    badgeClass: "border-border bg-muted text-foreground",
    amountClass: "text-foreground font-medium",
    sign: "",
    icon: ArrowRight,
  };
}
