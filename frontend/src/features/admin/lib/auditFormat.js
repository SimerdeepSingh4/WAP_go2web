import { dateTime, number, statusLabels } from "./format.js";

const fields = { username: "Name", email: "Email address", ratePerMsg: "Credits per recipient", expiresAt: "Expiry date", isLocked: "Credits locked", balance: "Available credits", balanceMinor: "Available credits", amountMinor: "Credits", amount: "Credits", resellerId: "Assigned reseller", createdBy: "Created by", userId: "Account", campaignTitle: "Campaign name", campaignDescription: "Campaign description", publicStatus: "Status shown to users", campaignSummary: "Campaign results", publishedSpreadsheet: "Published report", performedBy: "Changed by", fromUser: "From account", toUser: "To account", messageBody: "Message", dp_img: "Profile picture", phone: "Phone number", companyName: "Company name", totalRecipients: "Number of recipients", scheduledTime: "Scheduled time", schedule: "When to send", recipientReport: "Recipient report", type: "Activity type" };
const credits = { ALLOCATE: "Credits added", DEDUCT: "Credits used", REFUND: "Credits returned", RECLAIM: "Credits taken back", REQUEST: "Credits requested" };
const records = { user: "Account", account: "Account", campaign: "Campaign", wallet: "Credit balance", transaction: "Credit transaction", settings: "Settings", setting: "Settings", session: "Sign-in session" };

export function fieldLabel(key) {
  return fields[key] || key.replace(/[_-]/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (value) => value.toUpperCase());
}
export function actionLabel(event) {
  const [kind, action] = (event.action || "").split(".");
  if (kind === "transaction") {
    const name = credits[(event.data?.after || event.data?.before)?.type];
    if (name) return action === "deleted" ? `${name} record deleted` : action === "updated" ? `${name} record updated` : name;
  }
  if (kind === "request") return action === "started" ? "Activity started" : event.data?.outcome === "success" ? "Activity completed" : event.data?.outcome === "rejected" ? "Activity not completed" : "Activity response recorded";
  return `${records[kind] || fieldLabel(kind || "Record")} ${fieldLabel(action || "changed").toLowerCase()}`;
}
export function affectedRecord(event) {
  const record = event.data?.after || event.data?.before;
  const name = record?.campaignTitle || record?.username || record?.email;
  if (name) return name;
  const kind = (event.action || "").split(".")[0];
  if (kind === "request") return "Platform activity";
  const id = record?.userId || record?.toUser || record?._id || event.stream?.split(":").slice(1).join(":");
  return `${records[kind] || "Record"}${typeof id === "string" && id ? ` · ${id.slice(-6).toUpperCase()}` : ""}`;
}
export function basicActivityDetails(event) {
  const record = event.data?.after || event.data?.before || {};
  const details = [];
  if (record.amount !== undefined && record.amount !== null) details.push(["Credits", valueText(record.amount)]);
  else if (record.amountMinor !== undefined && record.amountMinor !== null) details.push(["Credits", valueText(record.amountMinor, "amountMinor")]);
  const notes = typeof record.notes === "string" ? record.notes.trim() : "";
  const campaignName = record.campaignTitle || record.campaignId?.campaignTitle || notes.match(/campaign\s+"([^"]+)"/i)?.[1];
  const campaignId = typeof record.campaignId === "string" ? record.campaignId : record.campaignId?._id;
  details.push([campaignName || campaignId ? "Campaign" : "Account or record", campaignName || (campaignId ? `CMP-${String(campaignId).slice(-6).toUpperCase()}` : affectedRecord(event))]);
  if (notes) details.push(["Description", notes]);
  return details;
}
export function valueText(value, key = "") {
  if (value === null || value === undefined || value === "") return "Not set";
  if (value === "[redacted]") return "Hidden for privacy";
  if (value === "[depth limited]") return "Full details were not saved";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return ["balanceMinor", "amountMinor"].includes(key) ? `${number(value / 100)} credits` : number(value);
  if (typeof value === "object") {
    if (value.count !== undefined && value.sha256) return `${number(value.count)} entries (individual details are not stored in this log)`;
    if (Array.isArray(value)) return value.map((item) => valueText(item)).join(", ") || "None";
    return Object.entries(value).filter(([field]) => !["_id", "__v"].includes(field)).map(([field, entry]) => `${fieldLabel(field)}: ${valueText(entry, field)}`).join("\n") || "No additional details";
  }
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:/.test(value)) return dateTime(value);
  return credits[value] || statusLabels[value] || ({ now: "As soon as approved", later: "At a scheduled time" })[value] || String(value);
}
export function changedFields(event) {
  const before = event.data?.before || {}, after = event.data?.after || {};
  return [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((key) =>
    !["_id", "__v", "updatedAt", "createdAt", "password"].includes(key)
    && JSON.stringify(before[key]) !== JSON.stringify(after[key])
    && !(key === "balanceMinor" && ("balance" in before || "balance" in after))
    && !(key === "amountMinor" && ("amount" in before || "amount" in after))
  );
}
