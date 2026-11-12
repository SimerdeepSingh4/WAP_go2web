import { useState, useEffect, useCallback, useRef } from "react";
import { useSocket } from "@/features/socket/socket.context";
import { supportApi } from "@/api/support.api";

/**
 * Custom hook to manage a real-time support conversation thread.
 * Supports:
 * - Room join/leave lifecycle
 * - Reconnection catching up via sequence numbers
 * - Idempotent retry-safe sending
 * - Identity-filtered participant rendering
 *
 * @param {string} conversationId
 * @param {object} currentUser
 */
export function useSupportChat(conversationId, currentUser) {
    const { socket } = useSocket();
    const [messages, setMessages] = useState([]);
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [status, setStatus] = useState("open");
    const [conversation, setConversation] = useState(null);

    const highestSeqRef = useRef(0);

    // Initial load of conversation messages
    const fetchInitialData = useCallback(async () => {
        if (!conversationId) return;
        setLoading(true);
        try {
            const [convRes, msgRes] = await Promise.all([
                supportApi.getConversationById(conversationId),
                supportApi.getMessages(conversationId, null, 50),
            ]);

            if (convRes.success) {
                setConversation(convRes.data);
                setStatus(convRes.data.status);
            }

            if (msgRes.success && Array.isArray(msgRes.data)) {
                setMessages(msgRes.data);
                if (msgRes.data.length > 0) {
                    highestSeqRef.current = msgRes.data[msgRes.data.length - 1].sequenceNumber;
                }
            }
        } catch (err) {
            console.error("Failed to load support chat:", err);
        } finally {
            setLoading(false);
        }
    }, [conversationId]);

    // Reconnection message sync
    const syncMissed = useCallback(() => {
        if (!socket || !conversationId) return;

        socket.emit("SUPPORT_SYNC_MESSAGES", {
            conversationId,
            lastSequence: highestSeqRef.current,
        }, (res) => {
            if (res?.success && Array.isArray(res.messages) && res.messages.length > 0) {
                setMessages((prev) => {
                    const map = new Map(prev.map((m) => [m.sequenceNumber, m]));
                    res.messages.forEach((m) => map.set(m.sequenceNumber, m));
                    const sorted = Array.from(map.values()).sort((a, b) => a.sequenceNumber - b.sequenceNumber);
                    highestSeqRef.current = sorted[sorted.length - 1].sequenceNumber;
                    return sorted;
                });
            }
        });
    }, [socket, conversationId]);

    useEffect(() => {
        fetchInitialData();
    }, [fetchInitialData]);

    useEffect(() => {
        if (!socket || !conversationId) return;

        // Join room
        socket.emit("JOIN_SUPPORT_CONVERSATION", { conversationId });
        syncMissed();

        const handleNewMessage = (msg) => {
            if (String(msg.conversationId) !== String(conversationId)) return;
            setMessages((prev) => {
                // Deduplicate by clientMessageId or sequenceNumber
                if (prev.some((m) => m.clientMessageId === msg.clientMessageId || m.sequenceNumber === msg.sequenceNumber)) {
                    return prev;
                }
                const next = [...prev, msg];
                highestSeqRef.current = Math.max(highestSeqRef.current, msg.sequenceNumber);
                return next;
            });
        };

        const handleStatusChange = (data) => {
            if (String(data.conversationId) === String(conversationId)) {
                setStatus(data.status);
            }
        };

        socket.on("SUPPORT_MESSAGE_RECEIVED", handleNewMessage);
        socket.on("SUPPORT_STATUS_CHANGED", handleStatusChange);
        socket.on("connect", syncMissed);

        return () => {
            socket.emit("LEAVE_SUPPORT_CONVERSATION", { conversationId });
            socket.off("SUPPORT_MESSAGE_RECEIVED", handleNewMessage);
            socket.off("SUPPORT_STATUS_CHANGED", handleStatusChange);
            socket.off("connect", syncMissed);
        };
    }, [socket, conversationId, syncMissed]);

    // Send message action
    const sendMessage = async (text, attachmentIds = []) => {
        if (!conversationId) return;
        setSending(true);

        const clientMessageId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

        try {
            const res = await supportApi.sendMessage(conversationId, {
                text,
                clientMessageId,
                attachmentIds,
            });

            if (res.success && res.data) {
                setMessages((prev) => {
                    if (prev.some((m) => m.clientMessageId === clientMessageId)) return prev;
                    const next = [...prev, res.data];
                    highestSeqRef.current = Math.max(highestSeqRef.current, res.data.sequenceNumber);
                    return next;
                });
            }
            return res.data;
        } finally {
            setSending(false);
        }
    };

    // Mark as read action
    const markRead = async () => {
        if (!conversationId || messages.length === 0) return;
        const lastSeq = highestSeqRef.current;
        await supportApi.markAsRead(conversationId, lastSeq);
    };

    return {
        conversation,
        messages,
        loading,
        sending,
        status,
        sendMessage,
        markRead,
        refresh: fetchInitialData,
    };
}

