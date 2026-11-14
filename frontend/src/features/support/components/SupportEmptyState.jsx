import { Headset, MessageCircle, Paperclip, ShieldCheck } from "lucide-react";
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
    <span className="support-eyebrow">{isUser ? "YOUR SUPPORT SPACE" : role === "Reseller" ? "RESELLER SUPPORT & CLIENT ASSISTANCE" : "A LITTLE CLARITY, EVERY CONVERSATION"}</span>
    <h2>{isUser ? "Your Admin is just a message away" : role === "Reseller" ? "Help your clients or reach Super Admin" : "Ready when they need you"}</h2>
    <p>{isUser ? "A question, an issue, or a little guidance. Your Admin is just a message away." : role === "Reseller" ? "Choose a client conversation to assist them, or start a direct chat with Super Admin for support." : "Choose a conversation to catch up, share an answer, and help move things forward."}</p>
    {canStart && <Button onClick={onStart} disabled={blocked} className="mt-1 gap-2"><MessageCircle className="size-4" />{isUser ? "Start a conversation" : "Chat with Super Admin"}</Button>}
    <div className="support-welcome-features">
      <span><MessageCircle />One shared conversation</span>
      <span><Paperclip />Images, video & audio</span>
      <span><ShieldCheck />{isUser ? "Extra help when needed" : "Super Admin assistance"}</span>
    </div>
  </div>;
}
