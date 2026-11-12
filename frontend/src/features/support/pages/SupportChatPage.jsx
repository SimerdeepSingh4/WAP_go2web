import { useState } from "react";
import { Link } from "react-router";
import {
  ArrowLeft,
  Check,
  CircleHelp,
  Headset,
  MessageCircle,
  Plus,
  Search,
  Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/hooks/useAuth";

const sampleMessages = [
  {
    id: 1,
    sender: "support",
    time: "13:32",
    text: "Welcome to the support team. What can we help you with today?",
  },
  {
    id: 2,
    sender: "you",
    time: "13:34",
    text: "A transaction from November 30 has not appeared in my balance yet.",
  },
  {
    id: 3,
    sender: "support",
    time: "13:35",
    text: "Thanks for flagging this. Please share the transaction amount so the team can review the details.",
  },
  {
    id: 4,
    sender: "you",
    time: "13:36",
    text: "It was $50.",
  },
];

function currentTime() {
  return new Intl.DateTimeFormat([], { hour: "2-digit", minute: "2-digit" }).format(new Date());
}

function ChatMessage({ message }) {
  const isSupport = message.sender === "support";

  return (
    <div className={`flex items-end gap-2.5 ${isSupport ? "justify-start" : "justify-end"}`}>
      {isSupport && (
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-sky-100 text-[10px] font-bold text-sky-900 dark:bg-sky-950 dark:text-sky-200">
          ST
        </span>
      )}
      <div className={`max-w-[min(82%,38rem)] rounded-lg px-4 py-3 ${isSupport ? "rounded-bl-sm bg-muted text-foreground" : "rounded-br-sm bg-sky-700 text-white"}`}>
        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{message.text}</p>
        <div className={`mt-2 flex items-center justify-end gap-1.5 text-[10px] ${isSupport ? "text-muted-foreground" : "text-sky-100"}`}>
          {message.previewOnly && <span>Preview only</span>}
          <span>{message.time}</span>
          {!isSupport && <Check className="size-3" aria-label="Previewed locally" />}
        </div>
      </div>
      {!isSupport && (
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[9px] font-semibold text-slate-700 dark:bg-slate-700 dark:text-slate-100">
          YOU
        </span>
      )}
    </div>
  );
}

export default function SupportChatPage() {
  const { user } = useAuth();
  const [messages, setMessages] = useState(sampleMessages);
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [isNewConversation, setIsNewConversation] = useState(false);
  const base = user?.role === "Super Admin" ? "/admin" : user?.role === "Reseller" ? "/reseller" : "/user";
  const conversationTitle = isNewConversation ? "New conversation" : "Credit balance question";
  const showSampleConversation = "credit balance question".includes(search.trim().toLowerCase());

  function startNewConversation() {
    setIsNewConversation(true);
    setMessages([]);
    setDraft("");
  }

  function openSampleConversation() {
    setIsNewConversation(false);
    setMessages(sampleMessages);
    setDraft("");
  }

  function sendMessage(event) {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setMessages((current) => [...current, {
      id: Date.now(),
      sender: "you",
      time: currentTime(),
      text,
      previewOnly: true,
    }]);
    setDraft("");
  }

  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-5">
      <div className="flex flex-col justify-between gap-4 border-b pb-5 sm:flex-row sm:items-end">
        <div>
          <Button variant="ghost" size="sm" className="-ml-2 mb-3 h-8 gap-1.5 px-2 text-xs text-muted-foreground" nativeButton={false} render={<Link to={base} />}>
            <ArrowLeft className="size-3.5" />
            Back to workspace
          </Button>
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-200">
              <Headset className="size-5" aria-hidden="true" />
            </span>
            <div>
              <p className="text-[10px] font-semibold uppercase text-sky-800 dark:text-sky-300">Support center</p>
              <h1 className="mt-1 text-xl font-semibold">Chat support</h1>
              <p className="mt-1 text-sm text-muted-foreground">View your support conversations and get help with your workspace.</p>
            </div>
          </div>
        </div>
        <Button type="button" className="h-9 shrink-0 gap-2 self-start sm:self-auto" onClick={startNewConversation}>
          <Plus className="size-4" />
          New conversation
        </Button>
      </div>

      <div className="flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
        <CircleHelp className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-xs font-semibold">Messaging preview</p>
          <p className="mt-0.5 text-xs leading-relaxed">Live support messaging is not connected yet. Messages you type here are only shown in this preview and are not sent or saved.</p>
        </div>
      </div>

      <section aria-label="Support inbox" className="grid min-h-[680px] overflow-hidden rounded-lg border bg-background shadow-sm md:h-[min(760px,calc(100dvh-14rem))] md:min-h-[560px] md:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="flex max-h-44 min-h-40 flex-col border-b bg-muted/20 md:max-h-none md:min-h-0 md:border-b-0 md:border-r" aria-label="Conversations">
          <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b px-4">
            <div>
              <h2 className="text-xs font-semibold">Conversations</h2>
              <p className="mt-0.5 text-[10px] text-muted-foreground">Recent support requests</p>
            </div>
            <Button type="button" variant="outline" size="icon" className="size-8" aria-label="Start new conversation" title="Start new conversation" onClick={startNewConversation}>
              <Plus className="size-4" />
            </Button>
          </div>
          <label className="relative mx-3 mt-3">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search conversations"
              aria-label="Search conversations"
              className="h-9 w-full rounded-md border border-input bg-background pl-8 pr-3 text-xs outline-none transition focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {showSampleConversation ? (
              <button
                type="button"
                onClick={openSampleConversation}
                aria-current={!isNewConversation ? "true" : undefined}
                className={`w-full rounded-md border p-3 text-left transition-colors ${
                  isNewConversation ? "border-transparent hover:bg-muted/70" : "border-border bg-background shadow-sm"
                }`}
              >
                <span className="flex items-start gap-2.5">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-sky-100 text-[10px] font-bold text-sky-900 dark:bg-sky-950 dark:text-sky-200">ST</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs font-semibold">Credit balance question</span>
                      <span className="shrink-0 text-[10px] text-muted-foreground">13:36</span>
                    </span>
                    <span className="mt-1 block truncate text-[11px] text-muted-foreground">It was $50.</span>
                    <span className="mt-2 inline-flex rounded-sm bg-sky-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-sky-800 dark:bg-sky-950 dark:text-sky-200">Example</span>
                  </span>
                </span>
              </button>
            ) : (
              <p className="px-3 py-8 text-center text-xs text-muted-foreground">No conversations found.</p>
            )}
          </div>
          <div className="hidden items-center gap-2 border-t px-4 py-3 text-[10px] text-muted-foreground md:flex">
            <MessageCircle className="size-3.5" aria-hidden="true" />
            Example conversation
          </div>
        </aside>

        <div className="flex min-h-[520px] min-w-0 flex-col md:min-h-0">
          <div className="flex min-h-16 shrink-0 items-center justify-between gap-3 border-b px-4 py-3 sm:px-5">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-sky-100 text-[10px] font-bold text-sky-900 dark:bg-sky-950 dark:text-sky-200">ST</span>
              <div className="min-w-0">
                <h2 className="truncate text-sm font-semibold">{conversationTitle}</h2>
                <p className="mt-0.5 text-[11px] text-muted-foreground">Support team</p>
              </div>
            </div>
            <span className="shrink-0 rounded-sm border border-sky-200 bg-sky-50 px-2 py-1 text-[10px] font-medium text-sky-800 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-200">
              {isNewConversation ? "New" : "Example"}
            </span>
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto bg-background px-4 py-5 sm:px-6 sm:py-6">
            {messages.length > 0 ? (
              <>
                <div className="flex items-center gap-3 text-[10px] font-medium uppercase text-muted-foreground">
                  <span className="h-px flex-1 bg-border" />
                  Example conversation
                  <span className="h-px flex-1 bg-border" />
                </div>
                {messages.map((message) => <ChatMessage key={message.id} message={message} />)}
              </>
            ) : (
              <div className="m-auto flex max-w-sm flex-col items-center px-4 text-center">
                <span className="flex size-12 items-center justify-center rounded-full bg-sky-50 text-sky-800 dark:bg-sky-950 dark:text-sky-200">
                  <MessageCircle className="size-5" aria-hidden="true" />
                </span>
                <h3 className="mt-4 text-sm font-semibold">Start a conversation</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">Write a message below to preview the support chat.</p>
              </div>
            )}
          </div>

          <div className="shrink-0 border-t bg-background p-3 sm:px-5 sm:py-4">
            <form onSubmit={sendMessage} className="rounded-md border border-input bg-background shadow-sm focus-within:ring-2 focus-within:ring-ring">
              <label className="sr-only" htmlFor="support-chat-draft">Write a message</label>
              <textarea
                id="support-chat-draft"
                rows={2}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
                placeholder="Write a message..."
                className="max-h-28 min-h-16 w-full resize-y bg-transparent px-3.5 py-3 text-sm leading-relaxed outline-none placeholder:text-muted-foreground"
              />
              <div className="flex items-center justify-between gap-3 border-t px-3 py-2">
                <p className="text-[10px] text-muted-foreground">Enter to preview · Shift + Enter for a new line</p>
                <Button type="submit" size="sm" className="h-8 gap-1.5 px-3 text-xs" disabled={!draft.trim()}>
                  <Send className="size-3.5" />
                  Preview message
                </Button>
              </div>
            </form>
          </div>
        </div>
      </section>
    </div>
  );
}