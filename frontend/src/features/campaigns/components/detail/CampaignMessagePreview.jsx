import { Copy, Check, CheckCheck } from "lucide-react";
import { number, dateTime } from "@/features/admin/lib/format";
import { CampaignMessage } from "@/components/dashboard/CampaignContent";
import CampaignActionLinks from "@/components/dashboard/CampaignActionLinks";
import { messageTextFromHtml } from "../../lib/messageText";

export default function CampaignMessagePreview({
  campaign,
  copiedText,
  onCopyMessage,
}) {
  const images = campaign.images || [];

  return (
    <section data-tour="campaign-message" className="min-w-0 overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-foreground">Message</h2>
        <button
          type="button"
          onClick={onCopyMessage}
          disabled={!campaign.messageBody}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {copiedText ? (
            <>
              <Check className="size-3.5 text-emerald-600" />
              Copied
            </>
          ) : (
            <>
              <Copy className="size-3.5" />
              Copy
            </>
          )}
        </button>
      </div>

      <div className="space-y-3 p-4">
        {/* Chat-style preview so the sender sees roughly what recipients see */}
        <div className="max-h-80 overflow-y-auto rounded-lg bg-muted/40 p-3 sm:p-4">
          <div className="ml-auto w-fit max-w-full rounded-xl rounded-tr-sm border border-black/5 bg-[var(--secondary)] px-3.5 py-3 sm:max-w-[95%]">
            {images[0] && (
              <img
                src={images[0].url}
                alt=""
                className="mb-2 w-full max-h-40 rounded-lg object-cover"
              />
            )}
            {campaign.messageBody ? (
              <CampaignMessage
                content={campaign.messageBody}
                className="rounded-none border-0 bg-transparent p-0 text-sm text-slate-900 leading-relaxed [overflow-wrap:anywhere]"
              />
            ) : (
              <p className="text-sm italic text-slate-500">No message body provided</p>
            )}
            <div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-slate-500">
              {dateTime(campaign.createdAt)}
              <CheckCheck className="size-3 text-sky-500" />
            </div>
          </div>
        </div>

        <CampaignActionLinks link={campaign.campaignLink} phone={campaign.campaignNumber} />

        <div className="flex flex-wrap items-start justify-between gap-2 text-[11px] leading-5 text-muted-foreground">
          <span className="tabular-nums shrink-0">
            {number(messageTextFromHtml(campaign.messageBody).length)} characters
          </span>
          {campaign.campaignDescription && (
            <span className="text-right line-clamp-2" title={campaign.campaignDescription}>
              Note: {campaign.campaignDescription}
            </span>
          )}
        </div>
      </div>
    </section>
  );
}

