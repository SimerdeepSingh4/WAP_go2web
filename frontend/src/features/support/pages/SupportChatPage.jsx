import { useCallback, useDeferredValue, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, ArrowDown, ArrowLeft, ArrowUpRight, Check, CheckCheck, ChevronLeft, ChevronRight, Eye, Hash, Headset, Inbox, Loader2, MessageCircle, Paperclip, Plus, RefreshCw, Search, Send, ShieldCheck, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { useSocket } from "@/features/socket/context/socket.context.jsx";
import { supportApi } from "@/features/support/services/support.api.js";
import { useSupportChat } from "@/features/support/hooks/useSupportChat";
import SupportMessage from "../components/SupportMessage";
import SupportConversationItem, { SupportAvatar } from "../components/SupportConversationItem";
import SupportEmptyState from "../components/SupportEmptyState";
import SupportAttachMenu from "../components/SupportAttachMenu";
import { buildSupportText, SUPPORT_REFERENCE_LIMIT, SUPPORT_TEXT_LIMIT } from "../lib/references";
import "./support.css";

const ACCEPT = "image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,audio/wav,audio/x-wav,application/pdf,text/plain,text/csv,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.pdf,.txt,.csv,.docx,.xlsx";
const FILE_EXTENSION = /\.(jpe?g|png|webp|gif|mp4|mov|wav|pdf|txt|csv|docx|xlsx)$/i;

function ChatPanel({ conversationId, user, onChanged, onBack, onStart, onDeleted }) {
  const chat = useSupportChat(conversationId, user);
  const location = useLocation();
  const navigate = useNavigate();
  const initialContext = user.role === "User" ? location.state?.supportDraft : null;
  const [draft, setDraft] = useState(() => initialContext?.text || "");
  const [attachments, setAttachments] = useState([]);
  const [references, setReferences] = useState(() => initialContext?.references || []);
  const [uploading, setUploading] = useState(false);
  const [sendError, setSendError] = useState("");
  const [reason, setReason] = useState("");
  const [escalating, setEscalating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showLatest, setShowLatest] = useState(false);
  const draftInput = useRef(null);
  const historyScroll = useRef(null);
  const messageList = useRef(null), scroller = useRef(null), fileInput = useRef(null), retry = useRef(null), uploadLock = useRef(false), submissionLock = useRef(false), alive = useRef(true), nearBottom = useRef(true), jumpingToLatest = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    if (conversationId && initialContext) navigate({ pathname: location.pathname, search: location.search }, { replace: true, state: { ...location.state, supportDraft: null } });
  }, [conversationId, initialContext, navigate, location.pathname, location.search, location.state]);
  const blocked = Boolean(user.isPreview || user.isExpired);
  const messageText = buildSupportText(draft, references);
  const referenceText = buildSupportText("", references);
  const draftLimit = SUPPORT_TEXT_LIMIT - referenceText.length - (references.length ? 2 : 0);
  useEffect(() => {
    if (!draftInput.current) return;
    draftInput.current.style.height = "auto";
    draftInput.current.style.height = `${Math.min(draftInput.current.scrollHeight, 144)}px`;
  }, [draft]);
  const lastSequence = chat.messages.at(-1)?.sequenceNumber || 0;
  useLayoutEffect(() => {
    if (nearBottom.current && scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight;
    if (nearBottom.current && !chat.loading) void chat.markRead();
  }, [lastSequence, chat.messages.length, chat.loading, chat.markRead]);
  useLayoutEffect(() => {
    const snapshot = historyScroll.current, viewport = scroller.current;
    if (!snapshot || !viewport || chat.loadingOlder) return;
    if (snapshot.anchor.isConnected) viewport.scrollTop += snapshot.anchor.getBoundingClientRect().top - viewport.getBoundingClientRect().top - snapshot.offset;
    historyScroll.current = null;
  }, [chat.loadingOlder, chat.hasOlder, chat.messages.length]);
  useEffect(() => {
    const viewport = scroller.current, content = messageList.current;
    if (!viewport || !content) return;
    // Keep the latest reply visible as media loads or the draft grows.
    // Reading earlier messages always takes priority over following the bottom.
    const observer = new ResizeObserver(() => {
      if (nearBottom.current) viewport.scrollTop = viewport.scrollHeight;
    });
    observer.observe(viewport);
    observer.observe(content);
    const finishJump = () => { jumpingToLatest.current = false; };
    viewport.addEventListener("scrollend", finishJump);
    return () => { observer.disconnect(); viewport.removeEventListener("scrollend", finishJump); };
  }, [conversationId]);
  useEffect(() => {
    const visible = () => { if (nearBottom.current && !chat.loading) void chat.markRead(); };
    document.addEventListener("visibilitychange", visible);
    return () => document.removeEventListener("visibilitychange", visible);
  }, [chat.markRead, chat.loading]);
  const status = useMutation({ mutationFn: next => supportApi.updateStatus(conversationId, next), onSuccess: () => { void chat.refresh(); onChanged(); }, onError: error => toast.add({ title: error.message, type: "error" }) });
  const escalation = useMutation({ mutationFn: () => supportApi.requestEscalation(conversationId, reason.trim()), onSuccess: () => { setEscalating(false); setReason(""); void chat.refresh(); onChanged(); toast.add({ title: "Super Admin assistance requested", type: "success" }); }, onError: error => toast.add({ title: error.message, type: "error" }) });
  const deletion = useMutation({
    mutationFn: () => supportApi.deleteConversation(conversationId),
    onSuccess: response => {
      setDeleting(false);
      onDeleted(conversationId);
      toast.add({ title: "Conversation deleted for everyone", description: response.cleanupPending ? "Some uploaded files could not be removed from storage." : undefined, type: response.cleanupPending ? "warning" : "success" });
    },
    onError: error => toast.add({ title: "Could not delete conversation", description: error.message, type: "error" }),
  });
  useEffect(() => {
    if (conversationId && chat.error?.response?.status === 404) onDeleted(conversationId);
  }, [conversationId, chat.error, onDeleted]);

  async function upload(event) {
    const files = [...(event.target.files || [])]; event.target.value = "";
    if (blocked || deletion.isPending || uploadLock.current || chat.sending) return;
    if (attachments.length + files.length > 5) { toast.add({ title: "Attach up to five files per message", type: "error" }); return; }
    uploadLock.current = true; setUploading(true); setSendError("");
    for (const file of files) {
      try {
        const image = file.type.startsWith("image/") || /\.(jpe?g|png|webp|gif)$/i.test(file.name);
        if (!ACCEPT.split(",").includes(file.type) && !FILE_EXTENSION.test(file.name)) throw Error("Choose an image, PDF, TXT, CSV, DOCX, XLSX, MP4, MOV or WAV file.");
        if (!file.size || file.size > (image ? 5 : 10) * 1024 * 1024) throw Error(image ? "Images must be no larger than 5 MB." : "Files must be no larger than 10 MB.");
        const response = await supportApi.uploadAttachment(conversationId, file);
        if (!alive.current) break;
        setAttachments(previous => [...previous, response.data]); retry.current = null;
      } catch (error) { if (alive.current) toast.add({ title: file.name, description: error.message, type: "error" }); }
    }
    uploadLock.current = false; if (alive.current) setUploading(false);
  }
  async function send(event) {
    event.preventDefault();
    if (blocked || deletion.isPending || chat.sending || uploading || submissionLock.current || (!messageText && !attachments.length)) return;
    if (messageText.length > SUPPORT_TEXT_LIMIT) { setSendError("Keep your message and references within 4,000 characters."); return; }
    submissionLock.current = true; setSendError("");
    const body = { text: messageText, attachmentIds: attachments.map(item => item._id) };
    const fingerprint = JSON.stringify(body);
    const clientMessageId = retry.current?.fingerprint === fingerprint ? retry.current.id : (window.crypto?.randomUUID?.() || `message-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    retry.current = { fingerprint, id: clientMessageId };
    try {
      const message = await chat.sendMessage({ ...body, clientMessageId });
      if (!message || !alive.current) return;
      setDraft(""); setAttachments([]); setReferences([]); setShowLatest(false); retry.current = null; nearBottom.current = true; onChanged();
      requestAnimationFrame(() => {
        if (scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight;
        draftInput.current?.focus({ preventScroll: true });
      });
    } catch (error) { if (alive.current) setSendError(error.message + " Your draft is preserved; use Send to retry."); }
    finally { submissionLock.current = false; }
  }
  function handleMessageScroll(event) {
    const element = event.currentTarget;
    const remaining = element.scrollHeight - element.scrollTop - element.clientHeight;
    // Smooth scrolling emits intermediate positions. Keep following until it
    // settles, including when an attachment changes height during the jump.
    if (jumpingToLatest.current && remaining > 1) return;
    nearBottom.current = remaining < 60;
    setShowLatest(!nearBottom.current);
    if (nearBottom.current) void chat.markRead();
  }
  function cancelJump() { jumpingToLatest.current = false; }
  function loadEarlierMessages() {
    const viewport = scroller.current, anchor = viewport?.querySelector(".support-message");
    if (!anchor || chat.loadingOlder || historyScroll.current) return;
    historyScroll.current = { anchor, offset: anchor.getBoundingClientRect().top - viewport.getBoundingClientRect().top };
    void chat.loadOlder();
  }
  function jumpToLatest() {
    jumpingToLatest.current = true;
    nearBottom.current = true;
    setShowLatest(false);
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  }
  function addReference(reference) {
    if (blocked || chat.sending || uploading || chat.loading || chat.error) return false;
    if (references.some(item => item.type === reference.type && item.label === reference.label && item.value === reference.value)) {
      toast.add({ title: "This reference is already attached", type: "info" });
      return true;
    }
    if (references.length >= SUPPORT_REFERENCE_LIMIT) { toast.add({ title: "Attach up to five references per message", type: "error" }); return false; }
    if (buildSupportText(draft, [...references, reference]).length > SUPPORT_TEXT_LIMIT) { toast.add({ title: "Shorten your message to make room for this reference", type: "error" }); return false; }
    setReferences(previous => [...previous, reference]);
    setSendError("");
    retry.current = null;
    return true;
  }
  if (!conversationId) return <div className="support-chat"><SupportEmptyState role={user.role} onStart={onStart} blocked={blocked} /></div>;
  const conversation = chat.conversation;
  const participant = user.role === "User" ? conversation?.reseller : conversation?.user;
  const participantLabel = user.role === "User" ? `${participant?.username || "Your Admin"} · ${participant?.displayRole || "Admin"}` : `${participant?.username || "User"} · ${conversation?.reseller?.username || "Admin"}`;
  const resolved = conversation?.status === "resolved";
  const needsAdmin = conversation?.escalation?.isEscalated && !conversation.escalation.resolvedAt;
  const unavailable = blocked || deletion.isPending || chat.sending || chat.loading || Boolean(chat.error);
  return <div className="support-chat" aria-label="Selected conversation">
    <header className="support-chat-header">
      <Button type="button" variant="ghost" size="icon-sm" className="support-mobile-back" aria-label="Back to conversations" onClick={onBack}><ArrowLeft /></Button>
      <SupportAvatar name={participant?.username} specialist={user.role === "User" && participant?.displayRole === "Super Admin"} />
      <div className="support-chat-heading"><div className="support-chat-title"><h2>{conversation?.subject || "Loading conversation…"}</h2><span className="support-status" data-resolved={resolved || undefined}>{resolved ? <CheckCheck /> : <span />}{resolved ? "Resolved" : "Open"}</span></div><p>{participantLabel}</p></div>
      {user.role !== "User" && <div className="support-chat-actions">
        {user.role === "Reseller" && <Button size="sm" variant="outline" disabled={blocked || escalation.isPending || chat.loading || !conversation || needsAdmin} onClick={() => setEscalating(true)}><ShieldCheck />{needsAdmin ? "Requested" : "Request Super Admin"}</Button>}
        <Button size="sm" variant="outline" disabled={blocked || deletion.isPending || status.isPending || chat.loading || !conversation} onClick={() => status.mutate(resolved ? "reopened" : "resolved")}>{status.isPending ? <Loader2 className="animate-spin" /> : resolved ? <RefreshCw /> : <Check />}{resolved ? "Reopen" : "Resolve"}</Button>
        {user.role === "Super Admin" && <Button type="button" size="sm" variant="destructive" disabled={unavailable || uploading || status.isPending || !conversation} onClick={() => { deletion.reset(); setDeleting(true); }}><Trash2 />Delete chat</Button>}
      </div>}
    </header>
    {needsAdmin && <div className="support-assistance-banner" role="status"><ShieldCheck /><div><strong>{user.role === "Super Admin" ? "Your assistance is needed" : user.role === "User" ? "A little extra help is on the way" : "Super Admin assistance requested"}</strong><p>{user.role === "Super Admin" ? conversation.escalation.reason : user.role === "User" ? "Your Admin has requested extra assistance. You can keep chatting here." : "The team has been notified. Keep the conversation going here."}</p></div>{user.role === "Super Admin" && <span className="support-important">Important</span>}</div>}
    {user.role === "Super Admin" && !needsAdmin && <div className="support-viewing-note"><Eye /><span>You’re viewing this conversation. Reply when you’re ready to help.</span></div>}
    {chat.error && <div role="alert" className="support-error"><AlertCircle /><span>{chat.error.message}</span><button type="button" onClick={chat.refresh}>Try again</button></div>}
    <div className="support-message-area">
      <div ref={scroller} className="support-messages" role="region" tabIndex={0} aria-label="Conversation messages" aria-busy={chat.loading} onScroll={handleMessageScroll} onWheel={cancelJump} onTouchStart={cancelJump} onPointerDown={cancelJump} onKeyDown={cancelJump}>
        <div ref={messageList} className="support-message-list">
        {chat.loading ? <div className="support-message-skeleton" role="status"><span className="sr-only">Loading conversation…</span><div /><div /><div /></div> : <>
          {chat.hasOlder && <Button variant="outline" size="xs" disabled={chat.loadingOlder} className="self-center" onClick={loadEarlierMessages}>{chat.loadingOlder && <Loader2 className="animate-spin" />}{chat.loadingOlder ? "Loading…" : "Earlier messages"}</Button>}
          {!chat.messages.length && !chat.error && <div className="support-thread-empty"><span><MessageCircle /></span><h3>{user.role === "User" ? "Your support space" : "You’re in the right place"}</h3><p>{user.role === "User" ? "A question, an issue, or a little guidance. Your Admin is just a message away." : "This conversation is ready. Send a message to get things started."}</p></div>}
          {chat.messages.map((message, index) => <SupportMessage key={message._id} message={message} previous={chat.messages[index - 1]} user={user} animate={chat.entranceSequence !== null && message.sequenceNumber > chat.entranceSequence} />)}
        </>}
        </div>
      </div>
      <div className="support-message-fade" aria-hidden="true" />
      {showLatest && <Button type="button" variant="outline" size="sm" className="support-jump-latest" onClick={jumpToLatest}><ArrowDown />Latest messages</Button>}
    </div>
    {sendError && <div className="support-error" role="alert"><AlertCircle /><span>{sendError}</span></div>}
    <form onSubmit={send} className="support-composer">
      {blocked && <p className="support-composer-notice">{user.isPreview ? "Messaging is unavailable in preview mode." : "Your account has expired. Messaging is unavailable."}</p>}
      {resolved && !blocked && <p className="support-composer-notice"><CheckCheck />Resolved. Sending a message will reopen this conversation.</p>}
      <div className="support-composer-box">
        {references.length > 0 && <ul className="support-pending-references" aria-label="References to send">{references.map((reference, index) => <li key={`${reference.type}:${reference.label}:${reference.value}`}><Hash aria-hidden="true" /><span><strong>{reference.label}</strong><code title={reference.value}>{reference.value}</code></span><button type="button" disabled={chat.sending || uploading} aria-label={`Remove ${reference.label} ${reference.value}`} onClick={() => { setReferences(previous => previous.filter((_, itemIndex) => itemIndex !== index)); retry.current = null; }}><X /></button></li>)}</ul>}
        {attachments.length > 0 && <ul className="support-pending-attachments" aria-label="Attachments to send">{attachments.map(file => <li key={file._id}><Paperclip /><span>{file.originalName}</span><button type="button" disabled={chat.sending || uploading} aria-label={`Remove ${file.originalName}`} onClick={() => { setAttachments(previous => previous.filter(item => item._id !== file._id)); retry.current = null; }}><X /></button></li>)}</ul>}
        <label htmlFor="support-chat-draft" className="sr-only">Write a message</label><textarea ref={draftInput} id="support-chat-draft" value={draft} onChange={event => setDraft(event.target.value)} disabled={unavailable} maxLength={draftLimit} rows={1} placeholder={user.role === "User" ? "Write your message…" : "Write a helpful reply…"} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} />
        <div className="support-composer-footer"><div className="flex min-w-0 items-center gap-2"><input ref={fileInput} type="file" className="sr-only" multiple accept={ACCEPT} aria-label="Attach support files" disabled={unavailable || uploading} onChange={upload} /><SupportAttachMenu disabled={unavailable || uploading} uploading={uploading} filesDisabled={attachments.length >= 5} referencesDisabled={references.length >= SUPPORT_REFERENCE_LIMIT} onFiles={() => fileInput.current?.click()} onAddReference={addReference} /><span className="support-draft-count" aria-live="polite">{messageText.length > 3500 ? `${messageText.length.toLocaleString()} / 4,000` : attachments.length ? `${attachments.length} / 5 files` : ""}</span></div><Button type="submit" size="sm" className="support-send-button" aria-label={chat.sending ? "Sending message" : "Send message"} disabled={unavailable || uploading || (!messageText && !attachments.length)}>{chat.sending ? <Loader2 className="animate-spin" /> : <Send />}<span>{chat.sending ? "Sending…" : "Send message"}</span></Button></div>
      </div>
      <div className="support-composer-hint justify-end"><span><kbd>Enter</kbd> to send<span className="support-shift-hint"> · <kbd>Shift + Enter</kbd> for a new line</span></span></div>
    </form>
    <Dialog open={deleting && user.role === "Super Admin"} onOpenChange={open => { if (!deletion.isPending) setDeleting(open); }}>
      <DialogContent showCloseButton={!deletion.isPending} className="gap-5 rounded-2xl p-5 sm:max-w-sm">
        <DialogHeader className="pr-6">
          <DialogTitle>Delete this support chat?</DialogTitle>
          <DialogDescription>This permanently removes the conversation, all messages and attachments for the user, reseller and Super Admin. This cannot be undone.</DialogDescription>
        </DialogHeader>
        <p className="break-words rounded-lg border border-border bg-muted/30 p-3 text-sm font-medium">{conversation?.subject}</p>
        {deletion.isError && <p role="alert" className="text-sm text-destructive">{deletion.error.message}</p>}
        <DialogFooter className="m-0 flex-row justify-end rounded-none border-0 bg-transparent p-0">
          <Button type="button" variant="outline" disabled={deletion.isPending} onClick={() => setDeleting(false)}>Keep chat</Button>
          <Button type="button" variant="destructive" disabled={blocked || deletion.isPending} onClick={() => deletion.mutate()}>{deletion.isPending ? <Loader2 className="animate-spin" /> : <Trash2 />}{deletion.isPending ? "Deleting…" : "Delete for everyone"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <Dialog open={escalating} onOpenChange={open => { if (!escalation.isPending) setEscalating(open); }}><DialogContent className="support-dialog"><span className="support-dialog-icon"><ShieldCheck /></span><DialogHeader><DialogTitle>Bring in a little extra help</DialogTitle><DialogDescription>Request Super Admin assistance in this conversation. They’ll receive an important notification with your reason.</DialogDescription></DialogHeader><form onSubmit={event => { event.preventDefault(); escalation.mutate(); }} className="space-y-5"><label className="block space-y-2 text-xs font-medium"><span>What do you need help with?</span><textarea className="support-reason-input" placeholder="Share the issue and what you’ve tried so far…" value={reason} onChange={event => setReason(event.target.value)} maxLength={2000} required disabled={escalation.isPending} /></label><div className="support-dialog-actions"><Button type="button" variant="outline" disabled={escalation.isPending} onClick={() => setEscalating(false)}>Cancel</Button><Button disabled={!reason.trim() || escalation.isPending} type="submit">{escalation.isPending ? <Loader2 className="animate-spin" /> : <ShieldCheck />}{escalation.isPending ? "Requesting…" : "Request assistance"}</Button></div></form></DialogContent></Dialog>
  </div>;
}

export default function SupportChatPage() {
  const { user } = useAuth();
  const { socket } = useSocket();
  const client = useQueryClient();
  const accountId = user?.id || user?._id;
  const [params, setParams] = useSearchParams();
  const conversationId = params.get("conversation") || "";
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [filter, setFilter] = useState("ongoing");
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [subject, setSubject] = useState("");
  const listParams = { page, limit: 20, search: deferredSearch, ...(user.role === "Super Admin" ? { filter } : { status: filter === "escalated" ? "ongoing" : ["ongoing", "resolved"].includes(filter) ? filter : undefined, isEscalated: filter === "escalated" ? "true" : undefined }) };
  const list = useQuery({ queryKey: ["support", accountId, "inbox", listParams], queryFn: ({ signal }) => user.role === "Super Admin" ? supportApi.getAdminInbox(listParams, signal) : supportApi.listConversations(listParams, signal), enabled: Boolean(accountId), refetchInterval: 15000 });
  const escalatedQuery = useQuery({
    queryKey: ["support", accountId, "escalated-count"],
    queryFn: ({ signal }) => user.role === "Super Admin"
      ? supportApi.getAdminInbox({ filter: "escalated", limit: 1 }, signal)
      : supportApi.listConversations({ isEscalated: "true", limit: 1 }, signal),
    enabled: Boolean(accountId && user.role !== "User"),
    refetchInterval: 15000,
  });
  const hasEscalated = Boolean(escalatedQuery.data?.total > 0);
  const refresh = () => void client.invalidateQueries({ queryKey: ["support", accountId] });
  const removeConversation = useCallback(id => {
    const deletedId = String(id);
    client.setQueriesData({ queryKey: ["support", accountId, "inbox"] }, previous => {
      if (!previous?.data?.some(item => String(item._id) === deletedId)) return previous;
      return { ...previous, data: previous.data.filter(item => String(item._id) !== deletedId), total: Math.max(0, previous.total - 1) };
    });
    client.removeQueries({ queryKey: ["support", accountId, "conversation", deletedId] });
    setParams(previous => {
      if (previous.get("conversation") !== deletedId) return previous;
      const next = new URLSearchParams(previous);
      next.delete("conversation");
      return next;
    }, { replace: true });
    setPage(1);
    void client.invalidateQueries({ queryKey: ["support", accountId] });
  }, [client, accountId, setParams]);
  const select = id => setParams(previous => { const next = new URLSearchParams(previous); next.set("conversation", id); return next; }, { replace: true });
  const backToInbox = () => setParams(previous => { const next = new URLSearchParams(previous); next.delete("conversation"); return next; }, { replace: true });
  const start = useMutation({ mutationFn: () => supportApi.getOrCreateConversation(subject.trim()), onSuccess: response => { setCreating(false); setSubject(""); setFilter("ongoing"); setPage(1); select(response.data._id); refresh(); }, onError: error => toast.add({ title: error.message, type: "error" }) });
  useEffect(() => {
    if (!conversationId && list.data?.data?.length && window.matchMedia("(min-width: 1024px)").matches) setParams(previous => { const next = new URLSearchParams(previous); next.set("conversation", list.data.data[0]._id); return next; }, { replace: true });
  }, [conversationId, list.data, setParams]);
  useEffect(() => {
    if (!socket) return;
    const refreshInbox = () => void client.invalidateQueries({ queryKey: ["support", accountId] });
    const revoked = data => { refreshInbox(); client.removeQueries({ queryKey: ["support", accountId, "conversation", data.conversationId] }); if (conversationId === String(data.conversationId)) setParams(previous => { const next = new URLSearchParams(previous); next.delete("conversation"); return next; }, { replace: true }); };
    const deleted = data => removeConversation(data.conversationId);
    const events = ["SUPPORT_CONVERSATION_CREATED", "SUPPORT_CONVERSATION_UPDATED", "SUPPORT_CONVERSATION_ASSIGNED", "SUPPORT_ESCALATION_ALERT", "SUPPORT_STATUS_CHANGED"];
    events.forEach(event => socket.on(event, refreshInbox)); socket.on("SUPPORT_CONVERSATION_REVOKED", revoked); socket.on("SUPPORT_CONVERSATION_DELETED", deleted); socket.on("connect", refreshInbox);
    return () => { events.forEach(event => socket.off(event, refreshInbox)); socket.off("SUPPORT_CONVERSATION_REVOKED", revoked); socket.off("SUPPORT_CONVERSATION_DELETED", deleted); socket.off("connect", refreshInbox); };
  }, [socket, accountId, client, conversationId, setParams, removeConversation]);
  const blocked = Boolean(user.isPreview || user.isExpired);
  const filters = [["ongoing", "Open"], ...(user.role !== "User" ? [["escalated", user.role === "Super Admin" ? "Needs you" : "Escalated"]] : []), ["resolved", "Resolved"], ["all", "All"]];
  return <div className="support-page">
    <header className="support-page-header">
      <div className="support-page-heading"><div className="flex items-center gap-3"><span className="support-page-icon"><Headset /></span><div><h1>{user.role === "User" ? "Your support space" : "Support inbox"}</h1>{user.role === "User" ? <p>A question, an issue, or a little guidance. Your Admin is just a message away.</p> : user.role === "Super Admin" ? <p>Keep an eye on conversations. Step in where it matters.</p> : null}</div></div></div>
      {user.role === "User" ? <Button disabled={blocked || start.isPending} onClick={() => setCreating(true)} className="support-new-chat"><Plus />New chat</Button> : <span className="support-workspace-role"><ShieldCheck />{user.role === "Super Admin" ? "Super Admin workspace" : "Reseller workspace"}</span>}
    </header>
    <section className="support-layout" aria-label="Support inbox" data-conversation-selected={Boolean(conversationId)}>
      <aside className="support-inbox" aria-label="Conversations">
        <div className="support-inbox-heading"><h2>Conversations{list.data && <span>{list.data.total}</span>}</h2><Button type="button" size="icon-sm" variant="ghost" aria-label="Refresh conversations" disabled={list.isFetching} onClick={refresh}><RefreshCw className={list.isFetching ? "animate-spin" : ""} /></Button></div>
        <div className="support-inbox-controls"><label className="support-search"><Search aria-hidden="true" /><Input type="search" placeholder="Search conversations…" aria-label="Search conversation subjects" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} /></label><div className="support-filters" aria-label="Conversation filter">{filters.map(([value, label]) => <button type="button" key={value} aria-pressed={filter === value} onClick={() => { setFilter(value); setPage(1); }}>{label}{value === "escalated" && hasEscalated && <span className="support-filter-dot" aria-hidden="true" />}</button>)}</div></div>
        <div className="support-conversations" aria-busy={list.isFetching}>
          {list.isPending && <div className="support-inbox-skeleton" role="status"><span className="sr-only">Loading conversations…</span>{[1, 2, 3].map(item => <div key={item}><span /><span /></div>)}</div>}
          {list.isError && <div role="alert" className="support-inbox-empty"><AlertCircle /><h3>Couldn’t load conversations</h3><p>{list.error.message}</p><Button type="button" size="sm" variant="outline" onClick={() => list.refetch()}>Try again</Button></div>}
          {list.data?.data?.map(conversation => <SupportConversationItem key={conversation._id} conversation={conversation} selected={conversationId === String(conversation._id)} role={user.role} onSelect={() => select(String(conversation._id))} />)}
          {list.isSuccess && !list.data?.data?.length && <div className="support-inbox-empty"><span className="support-inbox-empty-icon">{search ? <Search /> : filter === "resolved" ? <CheckCheck /> : <Inbox />}</span><h3>{search ? "No matches just yet" : filter === "escalated" ? "Nothing needs extra help" : filter === "resolved" ? "No resolved conversations" : "A clear inbox"}</h3><p>{search ? "Try a different subject or clear your search." : user.role === "User" ? "Need a hand? Start a conversation and your Admin will take it from there." : "Conversations will appear here when a user reaches out."}</p>{search ? <Button type="button" variant="outline" size="sm" onClick={() => { setSearch(""); setPage(1); }}>Clear search</Button> : user.role === "User" && <Button type="button" size="sm" variant="outline" disabled={blocked} onClick={() => setCreating(true)}><Plus />Start a conversation</Button>}</div>}
        </div>
        <footer className="support-inbox-footer"><span>{list.data ? `${list.data.total} conversation${list.data.total === 1 ? "" : "s"}` : "Your conversations"}</span>{(list.data?.total > 20 || page > 1) && <div className="flex items-center gap-2"><Button type="button" size="icon-xs" variant="ghost" disabled={page <= 1 || list.isFetching} aria-label="Previous conversations" onClick={() => setPage(value => value - 1)}><ChevronLeft /></Button><span>{page} / {Math.max(1, Math.ceil((list.data?.total || 0) / 20))}</span><Button type="button" size="icon-xs" variant="ghost" disabled={list.isFetching || !list.data || page * 20 >= list.data.total} aria-label="Next conversations" onClick={() => setPage(value => value + 1)}><ChevronRight /></Button></div>}<span className="support-inbox-footer-icon"><MessageCircle /></span></footer>
      </aside>
      <ChatPanel key={`${accountId}:${conversationId}`} conversationId={conversationId} user={user} onChanged={refresh} onBack={backToInbox} onStart={() => setCreating(true)} onDeleted={removeConversation} />
    </section>
    <Dialog open={creating} onOpenChange={open => { if (!start.isPending) setCreating(open); }}>
      <DialogContent className="support-dialog support-start-dialog">
        <DialogHeader className="support-start-dialog-header">
          <span className="support-dialog-icon"><MessageCircle aria-hidden="true" /></span>
          <div>
            <DialogTitle>{user.role === "User" ? "Start a conversation" : "Let’s start a conversation"}</DialogTitle>
            <DialogDescription>{user.role === "User" ? "A question, an issue, or a little guidance. Your Admin is just a message away." : "Tell us what you need help with. Your Admin will see your message and can bring in extra help if needed."}</DialogDescription>
          </div>
        </DialogHeader>
        <form className="support-start-dialog-form" onSubmit={event => { event.preventDefault(); start.mutate(); }}>
          <div className="support-dialog-field">
            <label htmlFor="support-conversation-subject">What’s on your mind?</label>
            <Input id="support-conversation-subject" autoFocus required maxLength={150} value={subject} onChange={event => setSubject(event.target.value)} placeholder="e.g. A question about my campaign" aria-describedby="support-start-note" disabled={start.isPending} />
          </div>
          <p id="support-start-note" className="support-dialog-note"><Inbox aria-hidden="true" /><span>Already have an open conversation? We’ll take you right back to it.</span></p>
          <div className="support-dialog-actions">
            <Button type="button" variant="outline" disabled={start.isPending} onClick={() => setCreating(false)}>Cancel</Button>
            <Button type="submit" disabled={blocked || !subject.trim() || start.isPending}>{start.isPending ? <Loader2 className="animate-spin" /> : <ArrowUpRight />}{start.isPending ? "Opening…" : "Start conversation"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  </div>;
}
