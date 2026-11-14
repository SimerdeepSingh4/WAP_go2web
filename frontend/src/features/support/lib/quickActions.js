export function supportDate(value) {
  if (!value) return "No expiry";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unavailable" : date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export function accountActionPayload(action, account, expiresAt) {
  return { action, expectedUpdatedAt: account.updatedAt, ...(action === "extend-expiry" ? { expiresAt } : {}) };
}
export function supportMenuActions(role) {
  const shared = ["credit", "transaction", "allocate", "expired", "blocked"];
  if (role === "Super Admin") return [...shared, "credit-validity", "ledger-audit"];
  if (role === "Reseller") return [...shared, "escalate"];
  return [];
}

