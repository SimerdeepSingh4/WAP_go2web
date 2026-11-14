export function hasConversationAccess(conversation, user) {
    if (!conversation || !user) return false;
    if (user.role === "Super Admin") return true;
    if (user.role === "Reseller" && String(conversation.reseller?._id || conversation.reseller) === String(user._id)) return true;
    return String(conversation.user?._id || conversation.user) === String(user._id);
}

export function canManageSupportAccount(account, viewer) {
    if (!account || account.role === "Super Admin" || String(account._id) === String(viewer._id)) return false;
    return viewer.role === "Super Admin" || (viewer.role === "Reseller" && account.role === "User" && String(account.resellerId) === String(viewer._id));
}
