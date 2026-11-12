import { Check } from "lucide-react";
import { SupportAvatar } from "./SupportConversationItem";
import SupportAttachment from "./SupportAttachment";

const idOf = value => String(value?._id || value || "");
const senderId = message => String(message.senderIdentity?.id || idOf(message.sender));

export function messageDay(value) {
  const date = new Date(value), today = new Date(), yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString([], { month: "short", day: "numeric", year: date.getFullYear() !== today.getFullYear() ? "numeric" : undefined });
}

export default function SupportMessage({ message, previous, user, animate = false }) {
  const identity = message.senderIdentity || {};
  const own = senderId(message) === String(user.id || user._id);
  const specialist = message.senderRole === "Super Admin";
  const name = specialist ? "Super Admin" : identity.displayName || "Support participant";
  const role = specialist ? "Super Admin" : user.role === "User" && message.senderRole === "Reseller" ? "Admin" : identity.displayRole || message.senderRole;
  const day = messageDay(message.createdAt);
  const newDay = !previous || messageDay(previous.createdAt) !== day;
  const grouped = !newDay && senderId(previous) === senderId(message) && new Date(message.createdAt) - new Date(previous.createdAt) < 300000;
  return <>
    {newDay && <div className="support-day-divider"><span>{day}</span></div>}
    <article className="support-message" data-own={own || undefined} data-sender-role={message.senderRole} data-role-highlight={!own && (user.role === "Super Admin" || user.role === "Reseller") || undefined} data-grouped={grouped || undefined} data-enter={animate || undefined} aria-label={own ? "Message from you" : `Message from ${name}`}>
      <SupportAvatar name={own ? user.username || "You" : name} specialist={specialist} className={grouped ? "support-avatar-hidden" : ""} />
      <div className="support-message-content">
        {!grouped && <div className="support-message-label"><strong>{own ? "You" : name}</strong>{!own && name !== role && <span>{role}</span>}</div>}
        <div className="support-bubble">{message.text && <p>{message.text}</p>}{message.attachments?.map(attachment => <SupportAttachment key={attachment._id} attachment={attachment} />)}</div>
        <div className="support-message-meta"><time dateTime={message.createdAt} title={new Date(message.createdAt).toLocaleString()}>{new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>{own && <Check className="size-3" aria-label="Sent" />}</div>
      </div>
    </article>
  </>;
}
