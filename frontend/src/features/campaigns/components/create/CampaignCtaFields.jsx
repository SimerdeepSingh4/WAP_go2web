import { useState } from "react";
import { Link2, Phone } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CALL_BUTTON_LABELS, CTA_LABEL_LIMIT, LINK_BUTTON_LABELS } from "../../../../../../shared/campaignCta.js";

function ButtonLabelPicker({ id, title, presets, value, onChange, readOnly }) {
  const [customMode, setCustomMode] = useState(false);
  const custom = customMode || !presets.includes(value);
  const options = [...presets.map(label => ({ value: label, label })), { value: "custom", label: "Custom text…" }];
  return <div className="space-y-2">
    <div className="space-y-1.5">
      <Label htmlFor={`${id}-label`}>{title}</Label>
      <Select value={custom ? "custom" : value} disabled={readOnly} items={options} onValueChange={next => {
        if (readOnly) return;
        setCustomMode(next === "custom");
        onChange(next === "custom" ? "" : next);
      }}>
        <SelectTrigger id={`${id}-label`} className="h-10 w-full bg-card text-sm"><SelectValue /></SelectTrigger>
        <SelectContent align="start" alignItemWithTrigger={false}>
          {options.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
    {custom && <div className="space-y-1.5">
      <Label htmlFor={`${id}-name`}>Custom {title.toLowerCase()}</Label>
      <Input id={`${id}-name`} value={value} readOnly={readOnly} maxLength={CTA_LABEL_LIMIT}
        onChange={event => { if (!readOnly) onChange(event.target.value.slice(0, CTA_LABEL_LIMIT)); }}
        placeholder="Enter button text" aria-describedby={`${id}-counter`} />
      <p id={`${id}-counter`} className="text-right text-[11px] tabular-nums text-muted-foreground">{value.length} / {CTA_LABEL_LIMIT} characters</p>
    </div>}
    {readOnly && <p className="text-[11px] text-muted-foreground">Button text is fixed for this approved template.</p>}
  </div>;
}

export default function CampaignCtaFields({
  campaignLink, onCampaignLinkChange, campaignLinkName, onCampaignLinkNameChange,
  campaignNumber, onCampaignNumberChange, campaignNumberName, onCampaignNumberNameChange,
  labelsReadOnly = false,
  linkError, phoneError,
}) {
  if (!onCampaignLinkChange && !onCampaignNumberChange) return null;
  return <div className="campaign-cta-fields">
    {onCampaignLinkChange && <fieldset className="campaign-cta-section">
      <legend><Link2 aria-hidden="true" />Campaign Link <span>Optional</span></legend>
      <ButtonLabelPicker id="campaign-link" title="Link Button Label" presets={LINK_BUTTON_LABELS} value={campaignLinkName} onChange={onCampaignLinkNameChange} readOnly={labelsReadOnly} />
      <div className="space-y-1.5">
        <Label htmlFor="campaign-link">Website URL</Label>
        <Input id="campaign-link" type="url" inputMode="url" autoComplete="url" placeholder="https://example.com/offer"
          value={campaignLink} onChange={event => onCampaignLinkChange(event.target.value)} maxLength={2048} aria-invalid={Boolean(linkError)} aria-describedby="campaign-link-hint" />
        <p id="campaign-link-hint" aria-live="polite" className={`text-xs leading-5 ${linkError ? "text-destructive" : "text-muted-foreground"}`}>{linkError || "Include https:// or http://."}</p>
      </div>
    </fieldset>}
    {onCampaignNumberChange && <fieldset className="campaign-cta-section">
      <legend><Phone aria-hidden="true" />Campaign Phone Number <span>Optional</span></legend>
      <ButtonLabelPicker id="campaign-number" title="Call Button Label" presets={CALL_BUTTON_LABELS} value={campaignNumberName} onChange={onCampaignNumberNameChange} readOnly={labelsReadOnly} />
      <div className="space-y-1.5">
        <Label htmlFor="campaign-number">Phone Number</Label>
        <Input id="campaign-number" type="tel" inputMode="tel" autoComplete="tel" placeholder="+91 98765 43210"
          value={campaignNumber} onChange={event => onCampaignNumberChange(event.target.value)} maxLength={40} aria-invalid={Boolean(phoneError)} aria-describedby="campaign-number-hint" />
        <p id="campaign-number-hint" aria-live="polite" className={`text-xs leading-5 ${phoneError ? "text-destructive" : "text-muted-foreground"}`}>{phoneError || "Include the country code, such as +91 or +1."}</p>
      </div>
    </fieldset>}
  </div>;
}
