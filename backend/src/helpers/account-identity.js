// Keep internal identities available to admins and use role labels externally.
export function publicAccountIdentity(account, viewerRole) {
    if (!account) {
        if (viewerRole === "User") {
            return { username: "Admin", role: "Admin" };
        }
        return account;
    }
    const accObj = account.toObject ? account.toObject() : account;
    if (viewerRole === "User") {
        if (accObj.role === "Super Admin") {
            return { _id: accObj._id, username: "Admin", role: "Admin" };
        }
        if (accObj.role === "Reseller") {
            const rawName = accObj.username || accObj.name || "Reseller";
            const cleanName = rawName.startsWith("Admin (") ? rawName.slice(7, -1) : rawName;
            return { _id: accObj._id, username: `Admin (${cleanName})`, role: "Admin", resellerName: cleanName };
        }
        return accObj;
    }
    if (accObj.role === "Super Admin" && viewerRole !== "Super Admin") {
        return { _id: accObj._id, username: "Super Admin", role: "Super Admin" };
    }
    return accObj;
}
