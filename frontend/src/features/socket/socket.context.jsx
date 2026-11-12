import { createContext, useContext, useEffect, useState } from "react";
import { io } from "socket.io-client";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthContext } from "@/features/auth/auth.context";
import { toast } from "@/components/ui/toast";
import { syncPushAccount, clearPushOwner } from "@/features/notifications/push";
import { clearCurrentSessionToken, getSessionToken } from "@/api/sessionToken";

const SocketContext = createContext(null);

export const SocketProvider = ({ children }) => {
    const { user } = useAuthContext();
    const accountId = user?.id || user?._id;
    const preview = Boolean(user?.isPreview);
    const queryClient = useQueryClient();
    const [connectedSocket, setConnectedSocket] = useState(null);

    useEffect(() => {
        if (!accountId) { void clearPushOwner().catch(() => {}); return; }
        if (!preview) void syncPushAccount(accountId).catch(() => {});
        const socket = io(import.meta.env.VITE_BACKEND_URL || (import.meta.env.DEV ? "http://localhost:3000" : (typeof window !== "undefined" ? window.location.origin : "http://localhost:3000")), {
            auth: { token: getSessionToken() }, withCredentials: true,
            transports: ["websocket", "polling"], reconnectionAttempts: Infinity,
            reconnectionDelay: 1000, reconnectionDelayMax: 15000,
        });
        const refreshNotifications = () => queryClient.invalidateQueries({ queryKey: ["notifications", accountId] });
        const refreshAccounts = () => {
            for (const key of ["admin", "reseller", "user", "myWalletBalance", "myBalance", "creditTransactions", "managedUsers", "clientUsers", "dashboardStats"]) queryClient.invalidateQueries({ queryKey: [key] });
        };
        const visibility = () => socket.emit("NOTIFICATION_VISIBILITY", { visible: document.visibilityState === "visible" });
        socket.on("connect", () => { setConnectedSocket(socket); refreshNotifications(); refreshAccounts(); visibility(); });
        socket.on("disconnect", () => setConnectedSocket(null));
        socket.on("NOTIFICATIONS_CHANGED", refreshNotifications);
        socket.on("NOTIFICATION_CREATED", (data) => {
            const toastId = data.toastId || `notification-${data.id}`;
            if (document.visibilityState === "visible") {
                toast.add({ id: toastId, title: data.title, type: "info" });
            }

            // Update inbox in-place by notification ID and keep unread badge accurate
            queryClient.setQueriesData({ queryKey: ["notifications", accountId] }, (old) => {
                if (!old || !Array.isArray(old.items)) return old;
                const existingIndex = old.items.findIndex((item) => String(item._id) === String(data.id));
                let updatedItems = [...old.items];
                let newUnreadCount = old.unreadCount || 0;

                if (existingIndex !== -1) {
                    const existing = updatedItems[existingIndex];
                    if (existing.readAt) newUnreadCount += 1;
                    const updated = {
                        ...existing,
                        title: data.title || existing.title,
                        body: data.body || existing.body,
                        readAt: null,
                        createdAt: new Date().toISOString(),
                    };
                    updatedItems.splice(existingIndex, 1);
                    updatedItems.unshift(updated);
                } else {
                    newUnreadCount += 1;
                }

                return {
                    ...old,
                    items: updatedItems,
                    unreadCount: newUnreadCount,
                };
            });

            refreshNotifications();
        });
        // Existing socket events keep business screens current. Persistent
        // notifications own the toast so the same event is not shown twice.
        socket.on("WALLET_UPDATED", refreshAccounts);
        const refreshCampaigns = () => {
            refreshAccounts();
            for (const key of ["campaignsList", "campaign-detail", "campaign-report"]) queryClient.invalidateQueries({ queryKey: [key] });
        };
        for (const event of ["CAMPAIGN_UPDATED", "NEW_CAMPAIGN_SUBMITTED", "CLIENT_CAMPAIGN_LAUNCHED"]) socket.on(event, refreshCampaigns);
        socket.on("SESSIONS_CHANGED", () => {
            queryClient.invalidateQueries({ queryKey: ["accountSessions"] });
            queryClient.invalidateQueries({ queryKey: ["activeSessions"] });
        });
        socket.on("SESSION_EXPIRED", (data) => {
            void clearPushOwner().catch(() => {});
            const signedOut = data?.reason === "You have signed out.";
            toast.add({
                title: signedOut ? "Signed out successfully" : "Please sign in again",
                description: signedOut
                    ? "Sign in again to access your account."
                    : data?.reason || "Your sign-in has expired. Sign in again to continue.",
                type: "info",
            });
            clearCurrentSessionToken();
            queryClient.setQueryData(["authUser"], null);
            queryClient.removeQueries({ queryKey: ["notifications"] });
            window.dispatchEvent(new CustomEvent("auth:unauthorized"));
        });
        const storage = (event) => { if (event.key === "notification-sync") refreshNotifications(); };
        const pushed = (event) => { if (event.data?.type === "NOTIFICATIONS_CHANGED") refreshNotifications(); };
        document.addEventListener("visibilitychange", visibility);
        window.addEventListener("storage", storage);
        navigator.serviceWorker?.addEventListener("message", pushed);
        return () => {
            socket.disconnect();
            document.removeEventListener("visibilitychange", visibility);
            window.removeEventListener("storage", storage);
            navigator.serviceWorker?.removeEventListener("message", pushed);
        };
    }, [accountId, preview, queryClient]);

    return <SocketContext.Provider value={{ socket: connectedSocket }}>{children}</SocketContext.Provider>;
};

export const useSocket = () => useContext(SocketContext);
export { SocketContext };
