/**
 * Returns an accurate time-of-day greeting based on the current local hour:
 * - 05:00 - 11:59: Good morning
 * - 12:00 - 16:59: Good afternoon
 * - 17:00 - 04:59: Good evening
 *
 * @param {Date} [date=new Date()]
 * @returns {"Good morning" | "Good afternoon" | "Good evening"}
 */
export function getGreeting(date = new Date()) {
  const hours = date.getHours();
  if (hours >= 5 && hours < 12) {
    return "Good morning";
  }
  if (hours >= 12 && hours < 17) {
    return "Good afternoon";
  }
  return "Good evening";
}

