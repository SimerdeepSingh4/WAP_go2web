// Keep internal identities available to admins and use role labels externally.
export function publicAccountIdentity(account, viewerRole) {
    if (!account || account.role !== "Super Admin" || viewerRole === "Super Admin") return account;
    return { _id: account._id, username: "Super Admin", role: "Super Admin" };
}
