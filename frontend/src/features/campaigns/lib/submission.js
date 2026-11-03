// Keep estimates aligned with createCampaign in the existing server controller.
export function campaignEstimate({ role, ratePerMsg, balance, recipients }) {
  const unlimited = role === "Super Admin";
  const rate = unlimited ? 0 : Number(ratePerMsg) > 0 ? Number(ratePerMsg) : 12;
  const cost = recipients * rate;
  return { rate, cost, remaining: unlimited ? null : Number(balance) - cost, insufficient: !unlimited && cost > Number(balance) };
}

export function parseRecipients(raw) {
  const valid = [], seen = new Set();
  let invalidCount = 0, duplicatesCount = 0;
  for (const token of raw.split(/[\n,;\t]+/).map(value => value.trim()).filter(Boolean)) {
    const phone = token.replace(/\D/g, "");
    if (phone.length < 10 || phone.length > 15) invalidCount++;
    else if (seen.has(phone)) duplicatesCount++;
    else { seen.add(phone); valid.push(phone); }
  }
  return { validRecipients: valid, invalidCount, duplicatesCount };
}
