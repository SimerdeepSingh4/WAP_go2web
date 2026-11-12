import { CheckCheck, ShieldCheck } from "lucide-react";

function inboxTime(value) {
  if (!value) return "";
  const date = new Date(value);
  return date.toDateString() === new Date().toDateString()
    ? date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleDateString([], { month: "short", day: "numeric" });
}

export function SupportAvatar({ name, specialist = false, className = "" }) {
  const initials = (name || "Support").trim().split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase();
  return <span className={`support-avatar ${className}`} data-specialist={specialist || undefined} aria-hidden="true">{specialist ? <ShieldCheck /> : initials}</span>;
}

export default function SupportConversationItem({ conversation, selected, role, onSelect }) {
  const name = role === "User" ? conversation.reseller?.username || "Your Admin" : conversation.user?.username || "User";
  const escalated = conversation.escalation?.isEscalated && !conversation.escalation.resolvedAt;
  const resolved = conversation.status === "resolved";
  return <button type="button" className="support-conversation" aria-current={selected ? "true" : undefined} onClick={onSelect}>
    <SupportAvatar name={name} specialist={role === "User" && conversation.reseller?.displayRole === "Super Admin"} />
    <span className="support-conversation-copy">
      <span className="support-conversation-line"><strong>{name}</strong><time dateTime={conversation.latestActivity?.sentAt || conversation.createdAt}>{inboxTime(conversation.latestActivity?.sentAt || conversation.createdAt)}</time></span>
      <span className="support-conversation-subject">{conversation.subject}</span>
      <span className="support-conversation-line"><span className="support-conversation-preview">{conversation.latestActivity?.messageText || "New conversation. Say hello."}</span>{conversation.unreadCount > 0 && <span className="support-unread-count" aria-label={`${conversation.unreadCount} unread messages`}>{conversation.unreadCount > 99 ? "99+" : conversation.unreadCount}</span>}</span>
      {(escalated || resolved) && <span className="support-conversation-state" data-escalated={escalated || undefined}>{escalated ? <><ShieldCheck />{role === "User" ? "Extra assistance requested" : "Needs Super Admin"}</> : <><CheckCheck />Resolved</>}</span>}
    </span>
  </button>;
}
