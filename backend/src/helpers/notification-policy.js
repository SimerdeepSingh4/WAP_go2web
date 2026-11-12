export const notificationCategories = ["campaigns", "credits", "accounts", "system"];
export const roleBase = (role) => role === "Super Admin" ? "/admin" : role === "Reseller" ? "/reseller" : "/user";

export const notificationAttentionFilter = {
    $or: [{ itemType: "transaction", fieldKey: "REQUEST" }, { priority: "urgent" }],
};

export function notificationPriority(event) {
    const d = event.data || {};
    return d.priority === "urgent" || event.kind === "operations"
        || (event.kind === "support" && d.action === "escalated")
        || (event.kind === "expiry" && d.expired)
        || (event.kind === "wallet" && d.isLocked && d.changes?.includes("isLocked"))
        || (event.kind === "campaign" && d.status === "failed" && d.changes?.includes("status"))
        ? "urgent" : "normal";
}
export const sameId = (a, b) => Boolean(a && b && String(a._id || a) === String(b._id || b));
export const managesUser = (viewer, subject) => viewer?.role === "Reseller" && subject?.role === "User" && sameId(subject.createdBy, viewer._id) && sameId(subject.resellerId, viewer._id);

export function mayReadNotification(viewer, notification, subject) {
    if (!sameId(viewer._id, notification.recipientId) || viewer.role !== notification.recipientRole) return false;
    return !notification.managed || managesUser(viewer, subject);
}

export function getNotificationGroup(event, changeField) {
    const d = event.data;
    const kind = event.kind;

    if (kind === "support") {
        const conversationId = String(d.id);
        return {
            groupKey: `support:${conversationId}:escalation:requested`,
            itemType: "support",
            itemId: conversationId,
            changeType: "escalation",
            fieldKey: "requested",
        };
    }

    if (kind === "campaign") {
        const campaignId = String(d.id || d._id);
        if (d.isNew) {
            return {
                groupKey: `campaign:${campaignId}:creation:submission`,
                itemType: "campaign",
                itemId: campaignId,
                changeType: "creation",
                fieldKey: "submission",
            };
        }
        const field = changeField || (
            d.changes?.includes("status") ? "status" :
            d.changes?.includes("publishedSpreadsheet") ? "publishedSpreadsheet" :
            d.changes?.includes("campaignSummary.reportedAt") ? "campaignSummary.reportedAt" :
            (d.changes?.[0] || "status")
        );
        const changeType = field === "status" ? "status" : "report";
        return {
            groupKey: `campaign:${campaignId}:${changeType}:${field}`,
            itemType: "campaign",
            itemId: campaignId,
            changeType,
            fieldKey: field,
        };
    }

    if (kind === "user") {
        const userId = String(d.id || d._id);
        if (d.isNew) {
            return {
                groupKey: `user:${userId}:creation:account`,
                itemType: "user",
                itemId: userId,
                changeType: "creation",
                fieldKey: "account",
            };
        }
        const field = changeField || d.changes?.[0] || "status";
        return {
            groupKey: `user:${userId}:setting:${field}`,
            itemType: "user",
            itemId: userId,
            changeType: "setting",
            fieldKey: field,
        };
    }

    if (kind === "wallet") {
        const walletId = String(d.id || d.userId || d._id);
        const field = changeField || (d.changes?.includes("isLocked") ? "isLocked" : d.changes?.includes("expiresAt") ? "expiresAt" : "lowBalance");
        const changeType = field === "lowBalance" ? "balance" : "setting";
        return {
            groupKey: `wallet:${walletId}:${changeType}:${field}`,
            itemType: "wallet",
            itemId: walletId,
            changeType,
            fieldKey: field,
        };
    }

    if (kind === "transaction") {
        const txId = String(d.id || d._id);
        const type = d.type || "transaction";
        return {
            groupKey: `transaction:${txId}:transaction:${type}`,
            itemType: "transaction",
            itemId: txId,
            changeType: "transaction",
            fieldKey: type,
        };
    }

    if (kind === "expiry") {
        const userId = String(d.userId || d.id || "account");
        const state = d.expired ? "expired" : "soon";
        return {
            groupKey: `expiry:${userId}:expiry:${state}`,
            itemType: "expiry",
            itemId: userId,
            changeType: "expiry",
            fieldKey: state,
        };
    }

    if (kind === "operations") {
        return {
            groupKey: "operations:system:delivery-failure",
            itemType: "system",
            itemId: "operations",
            changeType: "delivery",
            fieldKey: "failure",
        };
    }

    return {
        groupKey: `generic:${event.eventKey || String(d?.id || "unknown")}`,
        itemType: "generic",
        itemId: String(d?.id || "unknown"),
        changeType: "update",
        fieldKey: "default",
    };
}

export function formatNotification(event, viewer, subject, threshold = 100) {
    const d = event.data;
    const base = roleBase(viewer.role);
    const isSelf = sameId(viewer._id, subject?._id);
    const subjectRole = subject?.role || "User";
    const subjectName = subject?.username || "Account";
    const subjectLabel = subject?.username ? `${subjectRole} "${subjectName}"` : "Account";

    const result = (category, title, body, href) => ({ category, title, body, href });

    if (event.kind === "support") {
        if (viewer.role !== "Super Admin" || d.action !== "escalated") return null;
        const body = `Super Admin assistance was requested for “${d.subject}”. ${d.reason || ""}`.trim().slice(0, 800);
        return result("system", "Super Admin assistance needed", body, `${base}/support?conversation=${encodeURIComponent(d.id)}`);
    }

    if (event.kind === "campaign") {
        if (viewer.role !== "Super Admin" && d.statusVisible === false && d.changes?.includes("status")) return null;
        const href = `${base}/campaigns/${d.id}${viewer.role === "Super Admin" ? "" : "/report"}`;
        if (d.isNew) {
            if (isSelf) {
                return result("campaigns", "Campaign submitted", `“${d.title}” was submitted with ${Number(d.total || 0).toLocaleString("en-IN")} recipients.`, href);
            }
            const title = viewer.role === "Super Admin"
                ? `Campaign awaiting approval: ${subjectName} (${subjectRole})`
                : `Campaign submitted by ${subjectName} (${subjectRole})`;
            const body = `${subjectLabel} submitted campaign “${d.title}” with ${Number(d.total || 0).toLocaleString("en-IN")} recipients.`;
            return result("campaigns", title, body, href);
        }
        if (d.changes?.includes("publishedSpreadsheet") && d.publishedAt) {
            const title = isSelf ? "Campaign report published" : `Campaign report published • ${subjectName}`;
            const body = isSelf
                ? `The report for “${d.title}” is available.`
                : `The report for campaign “${d.title}” (${subjectLabel}) is available.`;
            return result("campaigns", title, body, `${base}/campaigns/${d.id}/report`);
        }
        if (d.changes?.includes("status")) {
            const title = isSelf ? `Campaign ${d.status}` : `Campaign ${d.status} • ${subjectName}`;
            const body = isSelf
                ? `“${d.title}” is now ${d.status}.`
                : `Campaign “${d.title}” by ${subjectLabel} is now ${d.status}.`;
            return result("campaigns", title, body, href);
        }
        if (d.publishedAt && d.changes?.includes("campaignSummary.reportedAt")) {
            const title = isSelf ? "Delivery results updated" : `Delivery results updated • ${subjectName}`;
            const body = isSelf
                ? `Delivery results for “${d.title}” have been updated.`
                : `Delivery results for campaign “${d.title}” (${subjectLabel}) have been updated.`;
            return result("campaigns", title, body, href);
        }
    }

    if (event.kind === "transaction") {
        const amount = Number(d.amount || 0).toLocaleString("en-IN");
        if (d.type === "REQUEST") {
            const href = `${base}/${viewer.role === "Super Admin" ? "activity" : "credits"}?transaction=${d.id}`;
            const note = d.notes ? ` Note: ${d.notes}` : "";
            return result("credits", isSelf ? "Credit request submitted" : `Credit request from ${subjectName}`, isSelf ? `Your request for ${amount} credits was submitted. Your balance has not changed.` : `${amount} credits were requested by ${subjectLabel}.${note}`, href);
        }
        const outgoing = sameId(viewer._id, d.fromUser) && !sameId(d.fromUser, d.toUser);

        if (isSelf) {
            const titles = {
                ALLOCATE: outgoing ? "Credits allocated" : "Credits received",
                DEDUCT: "Credits charged",
                REFUND: "Credits refunded",
                RECLAIM: "Credits reclaimed",
                REQUEST: "Credit request submitted",
            };
            const descriptions = {
                ALLOCATE: `${amount} credits were allocated.`,
                DEDUCT: `${amount} credits were charged.`,
                REFUND: `${amount} credits were returned to the wallet.`,
                RECLAIM: `${amount} credits were reclaimed.`,
                REQUEST: `${amount} credits were requested.`,
            };
            return result("credits", titles[d.type] || "Credit activity", descriptions[d.type] || "Credit activity was recorded.", `${base}/credits`);
        }

        const titles = {
            ALLOCATE: outgoing ? `Credits allocated to ${subjectName}` : `Credits received from ${subjectName}`,
            DEDUCT: `Credits charged • ${subjectName}`,
            REFUND: `Credits refunded • ${subjectName}`,
            RECLAIM: `Credits reclaimed • ${subjectName}`,
            REQUEST: `Credit request from ${subjectName}`,
        };
        const descriptions = {
            ALLOCATE: outgoing
                ? `${amount} credits were allocated to ${subjectLabel}.`
                : `${amount} credits were received from ${subjectLabel}.`,
            DEDUCT: `${amount} credits were charged for ${subjectLabel}.`,
            REFUND: `${amount} credits were refunded to ${subjectLabel}.`,
            RECLAIM: `${amount} credits were reclaimed from ${subjectLabel}.`,
            REQUEST: `${amount} credits were requested by ${subjectLabel}.`,
        };
        return result("credits", titles[d.type] || `Credit activity • ${subjectName}`, descriptions[d.type] || `Credit activity was recorded for ${subjectLabel}.`, `${base}/credits`);
    }

    if (event.kind === "user") {
        const href = isSelf
            ? `${base}/settings`
            : viewer.role === "Super Admin"
                ? `${base}/${d.role === "Reseller" ? "resellers" : d.role === "Super Admin" ? "administrators" : "users"}?search=${encodeURIComponent(d.username || "")}`
                : `${base}/users?search=${encodeURIComponent(d.username || "")}`;

        if (d.isNew) {
            const title = `New ${d.role || "user"} created: ${d.username}`;
            const body = `New ${d.role || "user"} account "${d.username}" was created.`;
            return result("accounts", title, body, href);
        }
        if (d.changes?.includes("status")) {
            const title = isSelf ? "Account status changed" : `Account status changed • ${subjectName}`;
            const body = isSelf
                ? `Account status is now ${d.status}.`
                : `Account status for ${subjectLabel} is now ${d.status}.`;
            return result("accounts", title, body, href);
        }
        if (d.changes?.includes("ratePerMsg")) {
            const title = isSelf ? "Message rate updated" : `Message rate updated • ${subjectName}`;
            const body = isSelf
                ? `The rate is now ${d.rate} credits per message.`
                : `Message rate for ${subjectLabel} is now ${d.rate} credits per message.`;
            return result("accounts", title, body, href);
        }
        if (d.changes?.includes("expiresAt")) {
            const title = isSelf ? "Account expiry updated" : `Account expiry updated • ${subjectName}`;
            const body = isSelf
                ? "The account expiry date has changed."
                : `Account expiry date for ${subjectLabel} has changed.`;
            return result("accounts", title, body, href);
        }
        if (d.changes?.includes("role")) {
            const title = isSelf ? "Account role updated" : `Account role updated • ${subjectName}`;
            const body = isSelf
                ? `Your account role is now ${d.role}.`
                : `Role for ${subjectLabel} is now ${d.role}.`;
            return result("accounts", title, body, href);
        }
        if (d.changes?.includes("deviceLimit")) {
            const title = isSelf ? "Device limit updated" : `Device limit updated • ${subjectName}`;
            const body = isSelf
                ? `Your allowed device limit is now ${d.deviceLimit}.`
                : `Device limit for ${subjectLabel} is now ${d.deviceLimit}.`;
            return result("accounts", title, body, href);
        }
    }

    if (event.kind === "wallet") {
        if (d.changes?.includes("isLocked")) {
            const title = isSelf
                ? (d.isLocked ? "Credit wallet locked" : "Credit wallet unlocked")
                : `Wallet ${d.isLocked ? "locked" : "unlocked"} • ${subjectName}`;
            const body = isSelf
                ? (d.isLocked ? "Campaign submission is unavailable while the wallet is locked." : "The wallet is available again.")
                : `Wallet for ${subjectLabel} is ${d.isLocked ? "locked. Campaign submission is unavailable." : "now unlocked and available again."}`;
            return result("credits", title, body, `${base}/credits`);
        }
        if (d.changes?.includes("expiresAt")) {
            const title = isSelf ? "Credit expiry updated" : `Credit expiry updated • ${subjectName}`;
            const body = isSelf
                ? "The credit expiry date has changed."
                : `Credit expiry date for ${subjectLabel} has changed.`;
            return result("credits", title, body, `${base}/credits`);
        }
        if (threshold > 0 && Number(d.balance) < threshold && Number(d.previous?.balance) >= threshold) {
            const title = isSelf ? "Low credit balance" : `Low credit balance • ${subjectName}`;
            const body = isSelf
                ? `The wallet balance is ${Number(d.balance).toLocaleString("en-IN")} credits, below the ${threshold}-credit alert threshold.`
                : `Wallet balance for ${subjectLabel} is ${Number(d.balance).toLocaleString("en-IN")} credits, below the ${threshold}-credit alert threshold.`;
            return result("credits", title, body, `${base}/credits`);
        }
    }

    if (event.kind === "expiry") {
        const title = isSelf
            ? (d.expired ? "Credits or account expired" : "Expiry approaching")
            : `${d.expired ? "Account expired" : "Expiry approaching"} • ${subjectName}`;
        const body = isSelf
            ? (d.expired ? "Access or credits have expired. Contact your account manager." : "Access or credits expire within seven days.")
            : `Access or credits for ${subjectLabel} ${d.expired ? "have expired." : "expire within seven days."}`;
        return result("accounts", title, body, `${base}/credits`);
    }

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
