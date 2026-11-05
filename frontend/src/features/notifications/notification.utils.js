/**
 * Utility to extract and format subject user information for notifications.
 */
export function getNotificationSubject(item) {
  if (!item) return null;

  if (item.subjectUserId && typeof item.subjectUserId === "object" && item.subjectUserId.username) {
    return {
      username: item.subjectUserId.username,
      role: item.subjectUserId.role || null,
    };
  }

  // Pattern 1: User "TestUser" or Reseller "TestUser" in body
  const quotedMatch = item.body?.match(/(User|Reseller|Super Admin)\s+"([^"]+)"/i);
  if (quotedMatch) {
    return {
      role: quotedMatch[1],
      username: quotedMatch[2],
    };
  }

  // Pattern 2: Legacy "TestUser: ..." in body
  const colonMatch = item.body?.match(/^([a-zA-Z0-9_.-]+):\s+/);
  if (colonMatch && colonMatch[1] !== "Account") {
    return {
      username: colonMatch[1],
      role: null,
    };
  }

  // Pattern 3: "• TestUser" or "by TestUser" in title
  const titleMatch = item.title?.match(/(?:•|by|approval:)\s+([a-zA-Z0-9_.-]+)/i);
  if (titleMatch) {
    return {
      username: titleMatch[1],
      role: null,
    };
  }

  return null;
}

