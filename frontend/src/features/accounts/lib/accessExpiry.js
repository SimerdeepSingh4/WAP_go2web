export function dateInputToday(now = Date.now()) {
  const date = new Date(now);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

// The existing access API treats date-only values as the end of that UTC day.
export function accessExpiryForDate(value, now = Date.now()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) throw new Error("Choose an expiry date.");
  const date = new Date(`${value}T23:59:59.999Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error("Choose a valid expiry date.");
  if (date.getTime() <= now) throw new Error("Choose today or a future expiry date.");
  return date.toISOString();
}
