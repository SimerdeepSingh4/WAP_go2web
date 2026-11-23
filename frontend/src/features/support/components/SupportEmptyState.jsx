import { Headset, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function SupportEmptyState({ role, onStart, blocked }) {
  const isUser = role === "User";
  const canStart = role !== "Super Admin";
  return <div className="support-welcome">
    <div className="support-welcome-art" aria-hidden="true">
      <span className="support-welcome-orbit" />
      <span className="support-welcome-orbit" />
      <span className="support-welcome-icon"><Headset /></span>
      <span className="support-welcome-mini"><MessageCircle /></span>
    </div>
    <h2>Select a conversation</h2>
    <p>{isUser ? "Open a chat to read replies from your admin." : role === "Reseller" ? "Open a client chat or message Super Admin for help." : "Open a conversation from your inbox to read and reply."}</p>
    {canStart && <Button onClick={onStart} disabled={blocked} className="mt-1 gap-2"><MessageCircle className="size-4" />{isUser ? "Start a conversation" : "Chat with Super Admin"}</Button>}
  </div>;
}
