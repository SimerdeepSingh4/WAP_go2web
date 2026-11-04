export function normalizeSavedRecipientEntry(entry) {
  const isFailed = entry.status === "failed";
  const tabKey = entry.tabKey || (isFailed ? "wrong" : "all");

  // Delivery status supplies defaults only. A saved tab or billing decision is
  // an explicit admin choice, including moving a failed number back to All.
  return {
    ...entry,
    rowNumber: Number(entry.rowNumber),
    phoneNumber: String(entry.phoneNumber ?? "").replace(/\D/g, ""),
    status: entry.status || "queued",
    tabKey,
    billingAction: entry.billingAction ||
      (["wrong", "duplicate", "non_whatsapp"].includes(tabKey) ? "refund" : "keep"),
    classification: entry.classification || (isFailed ? "wrong" : "pending"),
    category: entry.category || (isFailed ? "Wrong number" : "Queued"),
  };
}

export function assignNumbersToCategory(entries, text, tab) {
  const phones = new Set(text.split(/[\s,;]+/).map((value) => value.replace(/\D/g, "")).filter(Boolean));
  const assignment = {
    tabKey: tab.key,
    category: tab.label,
    billingAction: tab.defaultBilling || "keep",
  };
  let moved = 0;
  let added = 0;
  let nextRow = entries.reduce((max, entry) => Math.max(max, Number(entry.rowNumber)), 0) + 1;
  const result = entries.map((entry) => {
    const phone = String(entry.phoneNumber).replace(/\D/g, "");
    if (!phones.has(phone)) return entry;
    moved++;
    return { ...entry, ...assignment };
  });
  const existingPhones = new Set(entries.map((entry) => String(entry.phoneNumber).replace(/\D/g, "")));
  for (const phone of phones) {
    if (existingPhones.has(phone)) continue;
    result.push({
      rowNumber: nextRow++, phoneNumber: phone, status: "queued",
      classification: tab.key === "all" ? "pending" : tab.key,
      ...assignment,
    });
    added++;
  }
  return { entries: result, moved, added };
}
