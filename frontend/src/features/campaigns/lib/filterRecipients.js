const digits = (value) => String(value ?? "").replace(/\D/g, "");
const nonWhatsApp = (value) =>
  /^(?:non_?whatsapp(?:_failed)?|not_on_whatsapp|not_whatsapp)$/.test(
    String(value ?? "").toLowerCase().replace(/[\s-]+/g, "_")
  );

export const isExcludedRecipient = (entry) =>
  ["wrong", "duplicate", "non_whatsapp"].includes(entry.tabKey);

export function filterCampaignRecipients(entries = [], records = [], customColumns = []) {
  const verifiedNonWhatsApp = new Set(
    records
      .filter((record) => nonWhatsApp(record.category))
      .map((record) => digits(record.phoneNumber))
  );
  const seen = new Set();
  const counts = { wrongCount: 0, duplicateCount: 0, nonWhatsAppCount: 0, cleanCount: 0, refundCount: 0 };

  const updatedEntries = entries.map((entry) => {
    const phone = digits(entry.phoneNumber);

    // If already assigned to a custom column, preserve custom column assignment
    if (entry.customColumnId) {
      const customCol = customColumns.find((c) => c.id === entry.customColumnId);
      const isRefund = customCol?.defaultCredit === "refund" || customCol?.billingAction === "refund";
      if (isRefund) counts.refundCount++;
      return {
        ...entry,
        phoneNumber: phone,
        billingAction: isRefund ? "refund" : "keep",
      };
    }

    let tabKey;
    let isWrong = false;
    let isDuplicate = false;
    let isNonWhatsApp = false;

    if (phone.length < 10 || phone.length > 15 || entry.tabKey === "wrong") {
      tabKey = "wrong";
      isWrong = true;
      counts.wrongCount++;
      counts.refundCount++;
    } else if (entry.tabKey === "duplicate" || seen.has(phone)) {
      tabKey = "duplicate";
      isDuplicate = true;
      counts.duplicateCount++;
      counts.refundCount++;
    } else if (
      entry.tabKey === "non_whatsapp" ||
      verifiedNonWhatsApp.has(phone) ||
      nonWhatsApp(entry.status) ||
      nonWhatsApp(entry.category)
    ) {
      tabKey = "non_whatsapp";
      isNonWhatsApp = true;
      counts.nonWhatsAppCount++;
      seen.add(phone);
    } else {
      seen.add(phone);
      counts.cleanCount++;
      return entry;
    }

    const billingAction = tabKey === "non_whatsapp" ? "keep" : "refund";

    return {
      ...entry,
      phoneNumber: phone,
      tabKey,
      classification: tabKey,
      isDuplicate,
      isWrong,
      isNonWhatsApp,
      category: {
        wrong: "Wrong number",
        duplicate: "Duplicate",
        non_whatsapp: "Not on WhatsApp",
      }[tabKey],
      status: "failed",
      billingAction,
    };
  });

  return { updatedEntries, ...counts };
}

