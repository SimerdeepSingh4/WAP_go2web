export function messageTextFromHtml(html) {
  return String(html || "")
    .replace(/\r\n?/g, "\n")
    .replace(/<li>\s*<p>/gi, "<li>")
    .replace(/<\/p>\s*<\/li>/gi, "</li>")
    .replace(/<\/(p|div|h[1-6]|blockquote|pre|ul|ol)>/gi, "\n\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&amp;/gi, "&")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
