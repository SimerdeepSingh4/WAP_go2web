import { FileText, Link2 } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function SectionCard({ icon: Icon, title, description, aside, children, dataTour }) {
  return (
    <Card id={dataTour} data-tour={dataTour} className="campaign-form-section gap-0 rounded-xl border border-border py-0 shadow-none ring-0">
      <CardHeader className="border-b border-border px-4 py-3 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <Icon className="size-3.5 text-muted-foreground" />
              {title}
            </CardTitle>
            {description && <CardDescription className="mt-1 text-[11px] leading-5">{description}</CardDescription>}
          </div>
          {aside}
        </div>
      </CardHeader>
      <CardContent className="p-4 sm:p-5">{children}</CardContent>
    </Card>
  );
}

export default function CampaignDetailsSection({
  campaignTitle,
  onCampaignTitleChange,
  campaignDescription,
  onCampaignDescriptionChange,
  campaignLink,
  onCampaignLinkChange,
  campaignLinkName,
  onCampaignLinkNameChange,
  campaignNumber,
  onCampaignNumberChange,
}) {
  return (
    <SectionCard
      dataTour="create-details"
      icon={FileText}
      title="Campaign details"
      description="Name your campaign and add a short description."
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="title" className="text-xs font-medium">
            Campaign name <span className="text-destructive">*</span>
          </Label>
          <Input
            id="title"
            placeholder="e.g. Diwali special offer 2026"
            value={campaignTitle}
            onChange={(e) => onCampaignTitleChange(e.target.value)}
            className="h-10 bg-background text-sm focus-visible:ring-2 focus-visible:ring-ring/20"
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="description" className="text-xs font-medium">
            Description <span className="text-muted-foreground font-normal">(optional)</span>
          </Label>
          <Input
            id="description"
            placeholder="e.g. 20% flat discount promotion (optional)"
            value={campaignDescription}
            onChange={(e) => onCampaignDescriptionChange(e.target.value)}
            className="h-10 bg-background text-sm focus-visible:ring-2 focus-visible:ring-ring/20"
          />
        </div>
        {onCampaignLinkChange && (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="campaign-link" className="text-xs font-medium">
                Campaign link <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <div className="relative">
                <Link2 aria-hidden="true" className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="campaign-link"
                  type="url"
                  placeholder="https://example.com/offer"
                  value={campaignLink}
                  onChange={(e) => onCampaignLinkChange(e.target.value)}
                  className="h-10 bg-background pl-9 text-sm focus-visible:ring-2 focus-visible:ring-ring/20"
                  maxLength={2048}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="campaign-link-name" className="text-xs font-medium">
                Link name <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Input
                id="campaign-link-name"
                placeholder="e.g. Website, Book Now, Learn More"
                value={campaignLinkName || ""}
                onChange={(e) => onCampaignLinkNameChange?.(e.target.value)}
                className="h-10 bg-background text-sm focus-visible:ring-2 focus-visible:ring-ring/20"
                maxLength={150}
              />
            </div>
          </>
        )}
        {onCampaignNumberChange && <div className="space-y-1.5">
          <Label htmlFor="campaign-number" className="text-xs font-medium">
            Campaign number <span className="text-muted-foreground font-normal">(optional)</span>
          </Label>
          <Input
            id="campaign-number"
            type="tel"
            autoComplete="tel"
            placeholder="+919876543210"
            value={campaignNumber}
            onChange={(e) => onCampaignNumberChange(e.target.value)}
            className="h-10 bg-background text-sm focus-visible:ring-2 focus-visible:ring-ring/20"
            maxLength={40}
          />
        </div>}
      </div>
    </SectionCard>
  );
}

