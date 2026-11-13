import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSocket } from "@/features/socket/context/socket.context.jsx";
import { supportApi } from "@/features/support/services/support.api.js";

const merge = (previous, incoming) => [...new Map([...previous, ...incoming].map(message => [String(message._id), message])).values()].sort((a, b) => a.sequenceNumber - b.sequenceNumber);

export function useSupportChat(conversationId, currentUser) {
  const { socket } = useSocket();
  const accountId = currentUser?.id || currentUser?._id;
  const client = useQueryClient();
  const [state, setState] = useState({ id: null, messages: [], entranceSequence: null, loading: false, error: null, hasOlder: false, loadingOlder: false });
  const [sending, setSending] = useState(false);
  const [reload, setReload] = useState(0);
  const sequence = useRef(0), activeId = useRef(null), generation = useRef(0), readSequence = useRef(0), sendLock = useRef(false);
  const metadata = useQuery({ queryKey: ["support", accountId, "conversation", conversationId], queryFn: ({ signal }) => supportApi.getConversationById(conversationId, signal), enabled: Boolean(accountId && conversationId), refetchInterval: 15000 });
  const invalidate = useCallback(() => client.invalidateQueries({ queryKey: ["support", accountId] }), [client, accountId]);
  const receive = useCallback((messages, id) => {
    if (activeId.current !== id) return;
    // An HTTP send response can arrive before another participant's earlier reply.
    // Display it immediately, but keep the catch-up cursor before any missing gap.
    let contiguous = sequence.current;
    for (const message of [...messages].sort((a, b) => a.sequenceNumber - b.sequenceNumber)) {
      if (message.sequenceNumber === contiguous + 1) contiguous = message.sequenceNumber;
    }
    sequence.current = contiguous;
    setState(previous => previous.id === id ? { ...previous, messages: merge(previous.messages, messages) } : previous);
  }, []);

  useEffect(() => {
    activeId.current = conversationId;
    const revision = ++generation.current;
    sequence.current = 0; readSequence.current = 0;
    setState({ id: conversationId, messages: [], entranceSequence: null, loading: Boolean(conversationId), error: null, hasOlder: false, loadingOlder: false });
    if (!conversationId) return;
    const controller = new AbortController();
    supportApi.getMessages(conversationId, {}, controller.signal).then(response => {
      if (revision !== generation.current) return;
      const messages = response.data || [];
      sequence.current = Math.max(sequence.current, ...messages.map(message => message.sequenceNumber));
      setState(previous => ({ ...previous, messages: merge(messages, previous.messages), entranceSequence: Math.max(0, ...messages.map(message => message.sequenceNumber)), loading: false, hasOlder: messages.length === 50 }));
    }).catch(error => {
      if (!controller.signal.aborted && revision === generation.current) setState(previous => ({ ...previous, loading: false, error }));
    });
    return () => { controller.abort(); generation.current = revision + 1; activeId.current = null; };
  }, [conversationId, accountId, reload]);

  useEffect(() => {
    if (!conversationId || state.id !== conversationId || state.loading) return;
    let cancelled = false, syncing = false;
    const revision = generation.current;
    const sync = async () => {
      if (syncing || cancelled || document.visibilityState !== "visible") return;
      syncing = true;
      try {
        let batch;
        do {
          const response = await supportApi.getMessages(conversationId, { afterSequence: sequence.current, limit: 100 });
          if (cancelled || revision !== generation.current) return;
          batch = response.data || []; receive(batch, conversationId);
        } while (batch.length === 100);
      } catch { /* Background sync retries; initial request errors remain visible. */ }
      finally { syncing = false; }
    };
    const join = () => { socket?.emit("JOIN_SUPPORT_CONVERSATION", { conversationId }, () => void sync()); void sync(); };
    const message = data => {
      if (String(data.conversationId) !== conversationId) return;
      if (data.sequenceNumber > sequence.current + 1) void sync(); else receive([data], conversationId);
      void invalidate();
    };
    const changed = data => { if (String(data.conversationId) === conversationId) { void sync(); void invalidate(); } };
    socket?.on("SUPPORT_MESSAGE_RECEIVED", message); socket?.on("SUPPORT_STATUS_CHANGED", changed); socket?.on("SUPPORT_MESSAGES_READ", changed); socket?.on("connect", join);
    join();
    const interval = window.setInterval(sync, 10000);
    document.addEventListener("visibilitychange", sync);
    return () => {
      cancelled = true; clearInterval(interval); document.removeEventListener("visibilitychange", sync);
      socket?.emit("LEAVE_SUPPORT_CONVERSATION", { conversationId });
      socket?.off("SUPPORT_MESSAGE_RECEIVED", message); socket?.off("SUPPORT_STATUS_CHANGED", changed); socket?.off("SUPPORT_MESSAGES_READ", changed); socket?.off("connect", join);
    };
  }, [conversationId, socket, receive, invalidate, state.id, state.loading, reload]);

  async function loadOlder() {
    if (!conversationId || state.loadingOlder || !state.messages.length) return;
    const revision = generation.current;
    setState(previous => ({ ...previous, loadingOlder: true, error: null }));
    try {
      const response = await supportApi.getMessages(conversationId, { beforeSequence: state.messages[0].sequenceNumber });
      if (revision !== generation.current) return;
      receive(response.data || [], conversationId);
      setState(previous => ({ ...previous, hasOlder: response.data.length === 50 }));
    } catch (error) { if (revision === generation.current) setState(previous => ({ ...previous, error })); }
    finally { if (revision === generation.current) setState(previous => ({ ...previous, loadingOlder: false })); }
  }
  async function sendMessage(message) {
    if (!conversationId || sendLock.current || currentUser?.isPreview) return;
    sendLock.current = true; setSending(true);
    try { const response = await supportApi.sendMessage(conversationId, message); receive([response.data], conversationId); void invalidate(); return response.data; }
    finally { sendLock.current = false; setSending(false); }
  }
  const markRead = useCallback(async () => {
    const latest = sequence.current;
    if (!conversationId || !latest || latest <= readSequence.current || currentUser?.isPreview || document.visibilityState !== "visible") return;
    readSequence.current = latest;
    try { await supportApi.markAsRead(conversationId, latest); void client.invalidateQueries({ queryKey: ["support", accountId, "inbox"] }); }
    catch { if (activeId.current === conversationId) readSequence.current = 0; }
  }, [conversationId, currentUser?.isPreview, client, accountId]);
  return { conversation: metadata.data?.data, messages: state.id === conversationId ? state.messages : [], entranceSequence: state.entranceSequence, loading: Boolean(conversationId) && (state.id !== conversationId || state.loading || metadata.isPending), error: state.error || metadata.error, hasOlder: state.hasOlder, loadingOlder: state.loadingOlder, loadOlder, sending, sendMessage, markRead, refresh: () => { setReload(value => value + 1); void metadata.refetch(); }, connected: Boolean(socket?.connected) };
}
