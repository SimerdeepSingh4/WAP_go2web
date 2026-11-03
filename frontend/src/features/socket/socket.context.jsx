import React, { createContext, useContext, useEffect, useRef } from "react";
import { io } from "socket.io-client";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthContext } from "@/features/auth/auth.context";
import { toast } from "@/components/ui/toast";

const SocketContext = createContext(null);

export const SocketProvider = ({ children }) => {
    const { user } = useAuthContext();
    const queryClient = useQueryClient();
    const socketRef = useRef(null);

    useEffect(() => {
        if (!user) {
            if (socketRef.current) {
                socketRef.current.disconnect();
                socketRef.current = null;
            }
            return;
        }

        const token = localStorage.getItem("token");
        const backendUrl = import.meta.env.VITE_BACKEND_URL || "http://localhost:3000";

        // Initialize connection with JWT auth token and credentials
        const socket = io(backendUrl, {
            auth: { token },
            withCredentials: true,
            transports: ["websocket", "polling"],
            reconnectionAttempts: 5,
            reconnectionDelay: 1000,
        });

        socketRef.current = socket;

        socket.on("connect", () => {
            console.log("Connected to real-time notification socket:", socket.id);
        });

        // ── Real-Time Wallet Balance & Auto-Refund ─────────────
        socket.on("WALLET_UPDATED", (data) => {
            // Invalidate credit and user queries across all portals
            queryClient.invalidateQueries({ queryKey: ["myBalance"] });
            queryClient.invalidateQueries({ queryKey: ["creditTransactions"] });
            queryClient.invalidateQueries({ queryKey: ["managedUsers"] });
            queryClient.invalidateQueries({ queryKey: ["clientUsers"] });
            queryClient.invalidateQueries({ queryKey: ["admin"] });

            if (data.reason === "REFUND") {
                toast.add({
                    title: `+${data.delta} Credits Refunded`,
                    description: `Automatic refund for failed/wrong numbers on "${data.campaignTitle || 'Campaign'}". New balance: ${data.newBalance}`,
                    type: "success",
                });
            } else if (data.delta > 0) {
                toast.add({
                    title: `+${data.delta} Credits Received`,
                    description: `Your wallet was topped up. New balance: ${data.newBalance}`,
                    type: "success",
                });
            } else if (data.delta < 0 && data.reason !== "DEDUCT") {
                toast.add({
                    title: `Credits Reclaimed`,
                    description: `Deducted ${Math.abs(data.delta)} credits. New balance: ${data.newBalance}`,
                    type: "info",
                });
            }
        });

        // ── Real-Time Campaign & Delivery Status ───────────────
        socket.on("CAMPAIGN_UPDATED", (data) => {
            queryClient.invalidateQueries({ queryKey: ["campaignsList"] });
            queryClient.invalidateQueries({ queryKey: ["admin"] });
            queryClient.invalidateQueries({ queryKey: ["dashboardStats"] });

            toast.add({
                title: "Campaign Status Updated",
                description: `"${data.campaignTitle || 'Campaign'}" status is now ${data.status.toUpperCase()}${data.creditsRefunded ? ` (${data.creditsRefunded} credits refunded)` : ''}.`,
                type: "info",
            });
        });

        // ── Super Admin Live Campaign Queue Dispatch ───────────
        socket.on("NEW_CAMPAIGN_SUBMITTED", (data) => {
            queryClient.invalidateQueries({ queryKey: ["campaignsList"] });
            queryClient.invalidateQueries({ queryKey: ["admin"] });
            queryClient.invalidateQueries({ queryKey: ["dashboardStats"] });

            toast.add({
                title: "New Campaign Submitted",
                description: `"${data.campaignTitle}" (${data.totalRecipients} recipients) submitted by ${data.submittedBy}.`,
                type: "info",
            });
        });

        // ── Reseller Client Activity ───────────────────────────
        socket.on("CLIENT_CAMPAIGN_LAUNCHED", (data) => {
            queryClient.invalidateQueries({ queryKey: ["campaignsList"] });
            queryClient.invalidateQueries({ queryKey: ["clientUsers"] });

            toast.add({
                title: "Client Launched Campaign",
                description: `${data.clientName} launched "${data.campaignTitle}" (${data.totalRecipients} recipients).`,
                type: "info",
            });
        });

        // ── Real-Time Active Sessions Updated ──────────────────
        socket.on("SESSIONS_CHANGED", () => {
            queryClient.invalidateQueries({ queryKey: ["activeSessions"] });
            queryClient.invalidateQueries({ queryKey: ["admin"] });
        });

        // ── Instant Device Eviction (Disconnected / Limit Exceeded) ─
        socket.on("SESSION_EXPIRED", (data) => {
            toast.add({
                title: "Session Terminated",
                description: data?.reason || "This device session has been terminated.",
                type: "error",
            });
            localStorage.removeItem("token");
            queryClient.setQueryData(["authUser"], null);
            queryClient.removeQueries({ queryKey: ["activeSessions"] });
            window.dispatchEvent(new CustomEvent("auth:unauthorized"));

            // Immediately boot disconnected client out of protected pages
            if (window.location.pathname !== "/login") {
                window.location.replace("/login");
            }
        });

        return () => {
            socket.disconnect();
            socketRef.current = null;
        };
    }, [user, queryClient]);

    return (
        <SocketContext.Provider value={{ socket: socketRef.current }}>
            {children}
        </SocketContext.Provider>
    );
};

export const useSocket = () => {
    return useContext(SocketContext);
};

export default SocketContext;
