import { campaignRecipientError, campaignRecipientLines } from "../../../../../shared/campaignRecipients.js";

// Keep estimates aligned with createCampaign in the existing server controller.
export function campaignEstimate({ role, ratePerMsg, balance, recipients }) {
  const unlimited = role === "Super Admin";
  const rate = unlimited ? 0 : Number(ratePerMsg) > 0 ? Number(ratePerMsg) : 12;
  const cost = recipients * rate;
  return { rate, cost, remaining: unlimited ? null : Number(balance) - cost, insufficient: !unlimited && cost > Number(balance) };
}

export function splitRecipientInput(raw) {
  return campaignRecipientLines(raw).map(({ value }) => value);
}

// Editing permits incomplete numbers and any prefix, but never extra digits or
// non-digit characters. Validate the whole edit so paste cannot truncate a phone.
export function recipientEditError(raw) {
  const lines = raw.split(/\r\n?|\n/);
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (/[^0-9]/.test(line)) return { lineNumber: index + 1, message: "Only digits are allowed, with one number per line." };
    if (line.length > 12) return { lineNumber: index + 1, message: "A number cannot contain more than 12 digits." };
  }
  return null;
}

export function parseRecipients(raw) {
  const valid = [], seen = new Set();
  let duplicatesCount = 0;
  const invalidEntries = [];
  const lines = campaignRecipientLines(raw);
  for (const { value: phone, lineNumber } of lines) {
    const message = campaignRecipientError(phone);
    if (message) invalidEntries.push({ lineNumber, message });
    else if (seen.has(phone)) duplicatesCount++;
    else { seen.add(phone); valid.push(phone); }
  }
  return { validRecipients: valid, invalidCount: invalidEntries.length, invalidEntries, duplicatesCount, enteredCount: lines.length };
}
