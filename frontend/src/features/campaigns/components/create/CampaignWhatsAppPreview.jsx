import { createElement, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, BatteryFull, Camera, ExternalLink, FileText, MessageCircle, Mic, MoreVertical, Paperclip, Phone, Signal, Smile, Smartphone, Store, Wifi } from "lucide-react";
import { resolveUserImageUrl } from "@/features/accounts/lib/profileImage";
import "./campaign-whatsapp-preview.css";

// Render only editor formatting. Never copy HTML attributes or executable markup
// into the preview, including content restored from an older draft.
function formatMessage(html) {
  const document = new DOMParser().parseFromString(html || "", "text/html");
  const allowed = new Set(["p", "strong", "b", "em", "i", "u", "s", "strike", "ol", "ul", "li", "blockquote", "pre", "code", "br"]);
  const blocked = new Set(["script", "style", "iframe", "object", "embed", "svg", "math", "template"]);
  const render = (node, key) => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent.replace(/\u00a0/g, " ");
    if (node.nodeType !== Node.ELEMENT_NODE) return null;
    const tag = node.tagName.toLowerCase();
    if (blocked.has(tag) || node.classList.contains("ql-ui")) return null;
    const children = Array.from(node.childNodes, (child, index) => render(child, `${key}-${index}`));
    if (tag === "br") return <br key={key} />;
    if (node.classList.contains("ql-code-block-container")) return <pre key={key}>{children}</pre>;
    if (node.classList.contains("ql-code-block")) return <span className="wa-preview-code-line" key={key}>{children}</span>;
    if (tag === "div") return <p key={key}>{children}</p>;
    if (!allowed.has(tag)) return children;
    const props = { key };
    if (tag === "li" && node.getAttribute("data-list") === "bullet") props.style = { listStyleType: "disc" };
    return createElement(tag, props, children);
  };
  return Array.from(document.body.childNodes, (node, index) => render(node, String(index)));
}

export default function CampaignWhatsAppPreview({ messageBody, messageText, media, shareProfileDp, userProfileDp, campaignLink, campaignLinkName, campaignNumber, campaignNumberName }) {
  const content = useMemo(() => formatMessage(messageBody), [messageBody]);
  const conversationRef = useRef(null);
  const [previewExpanded, setPreviewExpanded] = useState(false);
  const [time] = useState(() => new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(new Date()));
  const selected = Object.entries(media).find(([, attachment]) => Boolean(attachment));
  const attachment = selected ? { ...selected[1], kind: selected[0] } : null;
  const profileDpUrl = shareProfileDp ? resolveUserImageUrl(userProfileDp) : "";
  const hasLink = Boolean(campaignLink?.trim() && campaignLinkName?.trim());
  const hasPhone = Boolean(campaignNumber?.trim() && campaignNumberName?.trim());
  const hasMessage = Boolean(messageText || attachment);

  useEffect(() => {
    const conversation = conversationRef.current;
    if (conversation) conversation.scrollTop = conversation.scrollHeight;
  }, [messageBody, media, shareProfileDp, campaignLink, campaignLinkName, campaignNumber, campaignNumberName, previewExpanded]);

  return (
    <aside className="campaign-whatsapp-preview" aria-label="Live WhatsApp message preview" data-expanded={previewExpanded}>
      <div className="wa-preview-heading">
        <h2><Smartphone aria-hidden="true" />WhatsApp preview</h2>
        <button type="button" className="campaign-preview-toggle" aria-expanded={previewExpanded} aria-controls="campaign-phone-preview" onClick={() => setPreviewExpanded(value => !value)}>
          {previewExpanded ? "Hide preview" : "Show preview"}
        </button>
      </div>

      <div id="campaign-phone-preview" className="wa-preview-phone">
        <div className="wa-preview-status" aria-hidden="true">
          <span>{time.split(/\s/)[0]}</span><span className="wa-preview-camera" /><div><Signal /><Wifi /><BatteryFull /></div>
        </div>
        <div className="wa-preview-chat-header">
          <ArrowLeft aria-hidden="true" />
          <span className="wa-preview-avatar">{profileDpUrl ? <img src={profileDpUrl} alt="Shared profile photo" /> : <Store aria-hidden="true" />}</span>
          <div className="wa-preview-contact"><strong>Your business</strong><span>Business account</span></div>
          <Phone aria-hidden="true" /><MoreVertical aria-hidden="true" />
        </div>
        <div ref={conversationRef} className="wa-preview-chat" style={{ backgroundImage: `linear-gradient(#f4f1eb99, #f4f1eb99), url("${import.meta.env.BASE_URL}whatsapp_light_bg.webp")` }} tabIndex={0} aria-label="Message preview conversation">
          <span className="wa-preview-day">Today</span>
          <div className="wa-preview-bubble">
            {attachment?.kind === "image" && <img className="wa-preview-image" src={attachment.preview} alt={attachment.name} />}
            {attachment?.kind === "video" && <video key={attachment.preview} className="wa-preview-video" src={attachment.preview} controls playsInline preload="metadata" aria-label={attachment.name} />}
            {attachment?.kind === "pdf" && (
              <div className="wa-preview-document"><span><FileText aria-hidden="true" /><small>PDF</small></span><div><strong>{attachment.name}</strong><span>PDF document</span></div></div>
            )}
            {messageText && <div className="wa-preview-message">{content}</div>}
            {!hasMessage && <div className="wa-preview-empty"><MessageCircle aria-hidden="true" /><span>Add a message or attachment to preview it here.</span></div>}
            {hasMessage && <div className="wa-preview-message-time">{time}</div>}
            {(hasLink || hasPhone) && <div className="wa-preview-ctas" aria-label="Campaign buttons">
              {hasLink && <div className="wa-preview-cta" data-cta="link"><ExternalLink aria-hidden="true" /><span>{campaignLinkName.trim()}</span></div>}
              {hasPhone && <div className="wa-preview-cta" data-cta="phone"><Phone aria-hidden="true" /><span>{campaignNumberName.trim()}</span></div>}
            </div>}
          </div>
        </div>
        <div className="wa-preview-composer" aria-hidden="true"><div><Smile /><span>Message</span><Paperclip /><Camera /></div><span className="wa-preview-mic"><Mic /></span></div>
        <div className="wa-preview-home" aria-hidden="true"><span /></div>
      </div>
    </aside>
  );
}
