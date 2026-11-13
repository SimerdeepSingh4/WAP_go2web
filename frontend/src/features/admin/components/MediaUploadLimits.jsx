import { useState } from "react";
import { Upload, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Link } from "react-router";
import useMediaUploadLimits, { useSaveMediaUploadLimits } from "@/features/campaigns/hooks/useMediaUploadLimits";
import { DEFAULT_MEDIA_UPLOAD_LIMITS, MEDIA_UPLOAD_LABELS, MAX_MEDIA_UPLOAD_MB, resolveMediaUploadLimits } from "../../../../../shared/mediaUploadLimits.js";

export function mediaUploadSummary(account, defaults) {
  const limits = resolveMediaUploadLimits(account?.mediaUploadLimits, defaults);
  return `Image ${limits.imageMB} MB / Video ${limits.videoMB} MB / PDF ${limits.pdfMB} MB`;
}

function LimitFields({ values, onChange, defaults, disabled }) {
  return <div className="grid gap-4 sm:grid-cols-3">{Object.keys(DEFAULT_MEDIA_UPLOAD_LIMITS).map(key => <label key={key} className="grid min-w-0 gap-2 text-xs font-medium">
    <span>{MEDIA_UPLOAD_LABELS[key]} limit (MB)</span>
    <Input aria-label={`${MEDIA_UPLOAD_LABELS[key]} limit (MB)`} type="number" min={1} max={MAX_MEDIA_UPLOAD_MB} step="0.01" disabled={disabled} value={values[key] ?? ""} placeholder={defaults ? String(defaults[key]) : undefined} onChange={event => onChange(key, event.target.value)} />
    {defaults && <span className="font-normal text-muted-foreground">Leave blank to use {defaults[key]} MB.</span>}
  </label>)}</div>;
}

export function CampaignMediaSettings() {
  const query = useMediaUploadLimits();
  const [edited, setEdited] = useState(null);
  const values = edited || query.defaults;
  const save = useSaveMediaUploadLimits({ onSuccess: () => setEdited(null) });
  return <Card className="portal-card portal-settings-card mb-6" data-tour="media-upload-settings">
    <div className="portal-card-heading"><span className="portal-settings-card-icon"><Upload aria-hidden="true" /></span><div><h2>Campaign upload limits</h2><p>Platform defaults for images, videos and PDFs. Saved on the server.</p></div></div>
    <form className="portal-settings-card-body" onSubmit={event => { event.preventDefault(); save.mutate(values); }}>
      {query.isError ? <div role="alert" className="text-sm">Could not load upload limits. <Button type="button" variant="outline" size="sm" onClick={() => query.refetch()}><RefreshCw />Retry</Button></div> : <>
        <LimitFields values={values} disabled={query.isPending || save.isPending} onChange={(key, value) => setEdited(current => ({ ...(current || query.defaults), [key]: value }))} />
        <p className="text-xs text-muted-foreground">Each file starts with a 3 MB limit. Set individual overrides from a user or reseller account’s Upload limits action. Existing attachments are kept.</p>
        <div className="flex flex-wrap gap-4 text-xs"><Link className="text-primary hover:underline" to="/admin/users">Manage user limits</Link><Link className="text-primary hover:underline" to="/admin/resellers">Manage reseller limits</Link></div>
        <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" disabled={query.isPending || save.isPending} onClick={() => setEdited({ ...DEFAULT_MEDIA_UPLOAD_LIMITS })}>Restore 3 MB defaults</Button><Button type="submit" disabled={query.isPending || save.isPending || !edited}>{save.isPending ? "Saving…" : "Save upload limits"}</Button></div>
      </>}
    </form>
  </Card>;
}

export function AccountMediaLimitsDialog({ account, onClose }) {
  const query = useMediaUploadLimits();
  const [values, setValues] = useState(() => Object.fromEntries(Object.keys(DEFAULT_MEDIA_UPLOAD_LIMITS).map(key => [key, account.mediaUploadLimits?.[key] ?? ""])));
  const save = useSaveMediaUploadLimits({ accountId: account._id, onSuccess: onClose });
  return <Dialog open onOpenChange={open => { if (!open && !save.isPending) onClose(); }}><DialogContent className="sm:max-w-xl">
    <DialogHeader><DialogTitle>Upload limits for {account.username}</DialogTitle><DialogDescription>Set image, video and PDF sizes for this {account.role.toLowerCase()}. Leave a field blank to follow the platform default.</DialogDescription></DialogHeader>
    <form className="space-y-5" onSubmit={event => { event.preventDefault(); save.mutate(values); }}>
      {query.isError && <p role="alert" className="text-xs text-destructive">Platform defaults could not be loaded. <button type="button" className="underline" onClick={() => query.refetch()}>Retry</button></p>}
      <LimitFields values={values} defaults={query.defaults} disabled={query.isPending || query.isError || save.isPending} onChange={(key, value) => setValues(current => ({ ...current, [key]: value }))} />
      <div className="flex flex-wrap justify-between gap-2"><Button type="button" variant="outline" disabled={save.isPending} onClick={() => setValues({ imageMB: "", videoMB: "", pdfMB: "" })}>Use platform defaults</Button><Button type="submit" disabled={query.isPending || query.isError || save.isPending}>{save.isPending ? "Saving…" : "Save upload limits"}</Button></div>
    </form>
  </DialogContent></Dialog>;
}
