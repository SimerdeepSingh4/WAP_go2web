import { createElement } from "react";

const allowedTags = new Set(["p", "br", "strong", "b", "em", "i", "u", "s", "ol", "ul", "li", "blockquote", "pre", "code"]);

// Rebuild editor markup as React elements; never render arbitrary HTML or attributes.
export function CampaignMessage({ content }) {
  if (!content) return <p className="text-muted-foreground">No text message.</p>;
  const document = new DOMParser().parseFromString(content, "text/html");
  function render(node, key) {
    if (node.nodeType === 3) return node.textContent;
    const tag = node.nodeName.toLowerCase();
    if (["script", "style", "iframe", "object", "svg"].includes(tag)) return null;
    const children = [...node.childNodes].map((child, index) => render(child, `${key}-${index}`));
    if (!allowedTags.has(tag)) return children;
    if (tag === "br") return <br key={key} />;
    return createElement(tag, { key }, ...children);
  }
  return <div className="campaign-message whitespace-pre-wrap break-words rounded-lg border bg-muted/40 p-4">{[...document.body.childNodes].map((node, index) => render(node, index))}</div>;
}

export function CampaignMedia({ campaign }) {
  return ["images", "video", "audio", "documents"].map(type => campaign[type]?.length > 0 && <section className="mt-3 space-y-2" key={type}>
    <h3 className="text-sm font-medium capitalize">{type}</h3>
    <ul className="space-y-2">{campaign[type].map((media, index) => {
      const raw = typeof media === "string" ? media : media.url;
      let url;
      try {
        const parsed = new URL(raw, new URL(import.meta.env.VITE_API_URL || "http://localhost:3000/api").origin);
        if (raw && ["http:", "https:"].includes(parsed.protocol)) url = parsed.href;
      } catch { /* Show the attachment name if its URL is unavailable. */ }
      const name = media.filename || `${type === "documents" ? "Document" : "Attachment"} ${index + 1}`;
      return <li key={index} className="text-sm break-words">{url ? <a href={url} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-4">{name}<span className="sr-only"> (opens in a new tab)</span></a> : `${name} — unavailable`}</li>;
    })}</ul>
  </section>);
}
