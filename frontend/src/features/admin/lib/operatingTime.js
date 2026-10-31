const pad = (value) => String(value).padStart(2, "0");

// The API-facing draft remains 24-hour HH:mm; only the picker uses AM/PM.
export function timeToWheelValue(time) {
  const [hours, minutes] = time.split(":").map(Number);
  return { hour: pad(hours % 12 || 12), minute: pad(minutes), period: hours >= 12 ? "pm" : "am" };
}

export function wheelValueToTime({ hour, minute, period }) {
  return `${pad(Number(hour) % 12 + (period === "pm" ? 12 : 0))}:${pad(Number(minute))}`;
}

export function formatOperatingTime(time) {
  const value = timeToWheelValue(time);
  return `${value.hour}:${value.minute} ${value.period.toUpperCase()}`;
}

export function validateOperatingWindow(start, end) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(start) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(end)) return "Select a valid start and end time.";
  if (end <= start) return "End time must be after start time within the same day.";
  return "";
}
