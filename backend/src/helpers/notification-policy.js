export const notificationCategories = ["campaigns", "credits", "accounts", "system"];
export const roleBase = (role) => role === "Super Admin" ? "/admin" : role === "Reseller" ? "/reseller" : "/user";
export const sameId = (a, b) => Boolean(a && b && String(a._id || a) === String(b._id || b));
export const managesUser = (viewer, subject) => viewer?.role === "Reseller" && subject?.role === "User" && sameId(subject.createdBy, viewer._id) && sameId(subject.resellerId, viewer._id);

export function mayReadNotification(viewer, notification, subject) {
    if (!sameId(viewer._id, notification.recipientId) || viewer.role !== notification.recipientRole) return false;
    return !notification.managed || managesUser(viewer, subject);
}

export function formatNotification(event, viewer, subject, threshold = 100) {
    const d = event.data;
    const base = roleBase(viewer.role);
    const prefix = sameId(viewer._id, subject?._id) ? "" : `${subject?.username || "Account"}: `;
    const result = (category, title, body, href) => ({ category, title, body: prefix + body, href });
    if (event.kind === "campaign") {
        const href = `${base}/campaigns/${d.id}${viewer.role === "Super Admin" ? "" : "/report"}`;
        if (d.isNew) return result("campaigns", viewer.role === "Super Admin" ? "Campaign awaiting approval" : "Campaign submitted", `“${d.title}” was submitted with ${Number(d.total || 0).toLocaleString("en-IN")} recipients.`, href);
        if (d.changes?.includes("publishedSpreadsheet") && d.publishedAt) return result("campaigns", "Campaign report published", `The report for “${d.title}” is available.`, `${base}/campaigns/${d.id}/report`);
        if (d.changes?.includes("status")) return result("campaigns", `Campaign ${d.status}`, `“${d.title}” is now ${d.status}.`, href);
        if (d.publishedAt && d.changes?.includes("campaignSummary.reportedAt")) return result("campaigns", "Delivery results updated", `Delivery results for “${d.title}” have been updated.`, href);
    }
    if (event.kind === "transaction") {
        const amount = Number(d.amount || 0).toLocaleString("en-IN");
        const outgoing = sameId(viewer._id, d.fromUser) && !sameId(d.fromUser, d.toUser);
        const titles = { ALLOCATE: outgoing ? "Credits allocated" : "Credits received", DEDUCT: "Credits charged", REFUND: "Credits refunded", RECLAIM: "Credits reclaimed", REQUEST: "Credit request submitted" };
        const descriptions = {
            ALLOCATE: `${amount} credits were allocated.`, DEDUCT: `${amount} credits were charged.`,
            REFUND: `${amount} credits were returned to the wallet.`, RECLAIM: `${amount} credits were reclaimed.`,
            REQUEST: `${amount} credits were requested.`,
        };
        return result("credits", titles[d.type] || "Credit activity", descriptions[d.type] || "Credit activity was recorded.", `${base}/credits`);
    }
    if (event.kind === "user") {
        const href = sameId(viewer._id, d.id) ? `${base}/settings` : viewer.role === "Super Admin" ? `${base}/${d.role === "Reseller" ? "resellers" : d.role === "Super Admin" ? "administrators" : "users"}?search=${encodeURIComponent(d.username || "")}` : `${base}/users?search=${encodeURIComponent(d.username || "")}`;
        if (d.isNew) return result("accounts", "Account created", `${d.username || "An account"} was created.`, href);
        if (d.changes?.includes("status")) return result("accounts", "Account status changed", `Account status is now ${d.status}.`, href);
        if (d.changes?.includes("ratePerMsg")) return result("accounts", "Message rate updated", `The rate is now ${d.rate} credits per message.`, href);
        if (d.changes?.includes("expiresAt")) return result("accounts", "Account expiry updated", "The account expiry date has changed.", href);
    }
    if (event.kind === "wallet") {
        if (d.changes?.includes("isLocked")) return result("credits", d.isLocked ? "Credit wallet locked" : "Credit wallet unlocked", d.isLocked ? "Campaign submission is unavailable while the wallet is locked." : "The wallet is available again.", `${base}/credits`);
        if (d.changes?.includes("expiresAt")) return result("credits", "Credit expiry updated", "The credit expiry date has changed.", `${base}/credits`);
        if (threshold > 0 && Number(d.balance) < threshold && Number(d.previous?.balance) >= threshold) return result("credits", "Low credit balance", `The wallet balance is ${Number(d.balance).toLocaleString("en-IN")} credits, below the ${threshold}-credit alert threshold.`, `${base}/credits`);
    }
    if (event.kind === "expiry") return result("accounts", d.expired ? "Credits or account expired" : "Expiry approaching", d.expired ? "Access or credits have expired. Contact your account manager." : "Access or credits expire within seven days.", `${base}/credits`);
    if (event.kind === "operations") return result("system", "Notification delivery needs attention", "Some deliveries exhausted their retries. Open the notification centre to inspect and retry them.", `${base}/notifications`);
    return null;
}

export function isAllowedPushEndpoint(endpoint) {
    try {
        const url = new URL(endpoint);
        return url.protocol === "https:" && !url.username && !url.password && (!url.port || url.port === "443") && (
            url.hostname === "fcm.googleapis.com" || url.hostname === "updates.push.services.mozilla.com" ||
            url.hostname.endsWith(".push.services.mozilla.com") || url.hostname === "web.push.apple.com" ||
            url.hostname.endsWith(".notify.windows.com")
        );
    } catch { return false; }
}
