import { createElement } from "react";
import { Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { campaignMediaUrl } from "@/features/campaigns/lib/mediaUrl";
import { resolveUserImageUrl } from "../../../accounts/lib/profileImage";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const allowedTags = new Set(["p", "br", "strong", "b", "em", "i", "u", "s", "ol", "ul", "li", "blockquote", "pre", "code"]);

// Rebuild editor markup as React elements; never render arbitrary HTML or attributes.
export function CampaignMessage({ content, className }) {
  if (!content) return <p className="text-muted-foreground">No text message.</p>;
  const document = new DOMParser().parseFromString(content, "text/html");
  function render(node, key) {
    if (node.nodeType === 3) return node.textContent.replace(/\u00a0/g, " ");
    const tag = node.nodeName.toLowerCase();
    if (["script", "style", "iframe", "object", "svg"].includes(tag)) return null;
    const children = [...node.childNodes].map((child, index) => render(child, `${key}-${index}`));
    if (!allowedTags.has(tag)) return children;
    if (tag === "br") return <br key={key} />;
    return createElement(tag, { key }, ...children);
  }
  return <div className={cn("campaign-message whitespace-pre-wrap break-words rounded-lg border bg-muted/40 p-4", className)}>{[...document.body.childNodes].map((node, index) => render(node, index))}</div>;
}

export function CampaignMedia({ campaign }) {
  const profileDp = campaign?.shareProfileDp ? (campaign?.profileDp || campaign?.userId?.dp_img) : null;
  const profileDpUrl = profileDp ? resolveUserImageUrl(profileDp) : null;

  return (
    <>
      {profileDpUrl && (
        <section className="mt-3 space-y-2">
          <h3 className="text-sm font-medium">Shared Profile DP</h3>
          <div className="flex items-center gap-3">
            <img src={profileDpUrl} alt="Shared Profile DP" className="size-10 rounded-full object-cover border" />
            <a href={profileDpUrl} target="_blank" rel="noopener noreferrer" className="text-primary text-sm underline underline-offset-4">
              View Profile DP
            </a>
          </div>
        </section>
      )}
      {["images", "video", "audio", "documents"].map(type => campaign[type]?.length > 0 && <section className="mt-3 space-y-2" key={type}>
        <h3 className="text-sm font-medium capitalize">{type}</h3>
        <ul className="space-y-2">{campaign[type].map((media, index) => {
          const url = campaignMediaUrl(media);
          const name = media.filename || `${type === "documents" ? "Document" : "Attachment"} ${index + 1}`;
          return <li key={index} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm break-words">{url ? <><a href={url} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-4">{name}<span className="sr-only"> (opens in a new tab)</span></a><a href={url} download={name} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><Download className="size-3.5" />Download</a></> : `${name} — unavailable`}</li>;
        })}</ul>
      </section>)}
    </>
  );
}

export function CampaignRecipients({ campaign }) {
  const recipients = campaign?.recipients || [];
  const hasPublishedReport = Boolean(campaign?.recipientReport?.uploadedAt);
  const reportStatuses = new Map(
    (campaign?.recipientReport?.records || []).map((record) => [record.phoneNumber, record.category])
  );
  const labels = {
    whatsapp_successful: "WhatsApp Successful",
    non_whatsapp_failed: "Non-WhatsApp Failed",
    spam: "Spam",
  };

  if (!hasPublishedReport) return null;

  return (
    <section className="space-y-3 border-t pt-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-medium">Campaign numbers</h2>
        <span className="text-xs text-muted-foreground">{recipients.length} numbers, original order</span>
      </div>
      {recipients.length ? (
        <div className="max-h-80 overflow-auto rounded-md border">
          <Table className="recipient-comparison min-w-[380px]">
            <TableHeader className="sticky top-0 z-10 bg-muted">
              <TableRow>
                <TableHead className="w-16">S.No</TableHead>
                <TableHead className="recipient-phone">Phone number</TableHead>
                {hasPublishedReport && <TableHead>Status</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {recipients.map((recipient, index) => {
                const reportStatus = reportStatuses.get(recipient.phoneNumber);
                return (
                  <TableRow key={`${recipient.phoneNumber}-${index}`}>
                    <TableCell className="tabular-nums text-muted-foreground">{index + 1}</TableCell>
                    <TableCell className="recipient-phone font-mono text-xs">{recipient.phoneNumber || "—"}</TableCell>
                    <TableCell className="text-xs">{labels[reportStatus] || "—"}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No recipient numbers are available.</p>
      )}
    </section>
  );
}
