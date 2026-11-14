import { useCallback, useEffect, useRef } from "react";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "cn";
import "./gradient-chat-input.css";

// Controlled JSX adaptation: the support chat owns persistence, drafts and retries.
// Activity comes from confirmed messages, never from a simulated auto-reply.
export default function GradientChatInput({
  value, onValueChange, inputRef, inputId = "chat-message", placeholder = "Send Message",
  maxLength, disabled = false, sending = false, canSend = false, startAdornment,
  children, activity = [], sound = true, className,
}) {
  const seen = useRef(new Set());
  const audio = useRef(null);

  const armAudio = useCallback(() => {
    if (!sound) return;
    try {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (Audio && (!audio.current || audio.current.state === "closed")) audio.current = new Audio();
      if (audio.current?.state === "suspended") void audio.current.resume().catch(() => {});
    } catch { /* Sound is optional when the browser cannot start audio. */ }
  }, [sound]);

  const playChime = useCallback(sender => {
    const context = audio.current;
    if (!sound || !context || context.state !== "running" || document.visibilityState !== "visible") return;
    const notes = sender === "user" ? [{ freq: 523.25, at: 0 }, { freq: 783.99, at: .06 }] : [{ freq: 392, at: 0 }, { freq: 587.33, at: .08 }];
    try {
      notes.forEach(({ freq, at }) => {
        const oscillator = context.createOscillator(), gain = context.createGain();
        const start = context.currentTime + at;
        oscillator.type = "sine"; oscillator.frequency.value = freq;
        gain.gain.setValueAtTime(.0001, start);
        gain.gain.exponentialRampToValueAtTime(.05, start + .012);
        gain.gain.exponentialRampToValueAtTime(.0001, start + .18);
        oscillator.connect(gain).connect(context.destination);
        oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
        oscillator.start(start); oscillator.stop(start + .2);
      });
    } catch { /* An audio failure must never interrupt messaging. */ }
  }, [sound]);

  useEffect(() => {
    const incoming = activity.filter(message => !seen.current.has(message.id));
    if (!incoming.length) return;
    incoming.forEach(message => seen.current.add(message.id));
    playChime(incoming.at(-1).sender);
  }, [activity, playChime]);

  useEffect(() => {
    return () => {
      const context = audio.current;
      audio.current = null;
      if (context && context.state !== "closed") void context.close().catch(() => {});
    };
  }, []);

  return <div className={cn("gradient-chat-input", className)} onPointerDownCapture={armAudio} onKeyDownCapture={armAudio}>
    <div className="gradient-chat-card">
      <div className="gradient-chat-content">
        {children}
        <div className="gradient-chat-row">
          <div className="gradient-chat-adornment">{startAdornment}</div>
          <label className="sr-only" htmlFor={inputId}>Write a message</label>
          <textarea ref={inputRef} id={inputId} value={value} onChange={event => onValueChange(event.target.value)}
            disabled={disabled} maxLength={maxLength} rows={1} placeholder={placeholder}
            onKeyDown={event => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault(); event.currentTarget.form?.requestSubmit();
              }
            }} />
          <Button type="submit" variant={canSend ? "default" : "secondary"} size="icon" className="support-send-button gradient-chat-send"
            aria-label={sending ? "Sending message" : "Send message"} disabled={disabled || !canSend || sending}
            onMouseDown={event => event.preventDefault()}>
            {sending ? <Loader2 className="animate-spin" /> : <Send strokeWidth={2.25} />}
          </Button>
        </div>
      </div>
    </div>
  </div>;
}
