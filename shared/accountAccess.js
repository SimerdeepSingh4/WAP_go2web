export function accountRestriction(user, now = Date.now()) {
  if (!user || user.isPreview) return null;
  if (user.status === "blocked" || user.isBlocked) return "blocked";
  if (user.status === "expired" || user.isExpired || (user.expiresAt && new Date(user.expiresAt).getTime() <= now)) return "expired";
  return null;
}

export function accountAccessMessage(user) {
  const status = accountRestriction(user);
  if (!status) return "";
  const account = user.username ? `my account with username ${user.username}` : "my account";
  return status === "blocked"
    ? `Hi, ${account} is blocked. Could you explain the reason and help me restore access?`
    : `Hi, ${account} has expired. Please help me renew my account and reactivate access.`;
}

export function allowsRestrictedRequest({ method, baseUrl, path }) {
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return true;
  if (baseUrl === "/api/auth") {
    return (method === "POST" && ["/logout", "/logout-all"].includes(path)) ||
      (method === "DELETE" && /^\/logout\/[^/]+\/?$/.test(path));
  }
  if (baseUrl === "/api/users" && method === "POST" && ["/exit-preview", "/exit-impersonation"].includes(path)) return true;
  // Existing support handlers still check roles and conversation membership.
  if (baseUrl !== "/api/support" || method !== "POST") return false;
  return path === "/conversations" || /^\/conversations\/[a-f\d]{24}\/(?:messages|read|attachments)\/?$/i.test(path);
}
