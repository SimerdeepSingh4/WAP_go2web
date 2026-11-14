import { useState } from "react";
import { FileUp, Hash, Loader2, Megaphone, Paperclip, Plus, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

const TYPES = {
  campaign: { label: "Campaign ID", Icon: Megaphone, placeholder: "Paste the campaign ID" },
  transaction: { label: "Transaction ID", Icon: Receipt, placeholder: "Paste the transaction ID" },
  other: { label: "Other reference", Icon: Hash, placeholder: "Paste the reference number or ID" },
};

export default function SupportAttachMenu({ disabled, uploading, filesDisabled, referencesDisabled, onFiles, onAddReference, iconOnly = false }) {
  const [type, setType] = useState(null);
  const [value, setValue] = useState("");
  const [label, setLabel] = useState("");
  const selected = TYPES[type];
  const Icon = selected?.Icon || Hash;

  function openReference(next) {
    setValue("");
    setLabel("");
    setType(next);
  }

  return <>
    <DropdownMenu>
      <DropdownMenuTrigger disabled={disabled} aria-label={uploading ? "Uploading attachments" : "Attach files or a reference"} render={<Button type="button" variant={iconOnly ? "secondary" : "ghost"} size={iconOnly ? "icon" : "sm"} className="support-attach-trigger" />}>
        {uploading ? <Loader2 className="animate-spin" /> : iconOnly ? <Plus /> : <Paperclip />}{!iconOnly && <span>{uploading ? "Uploading…" : "Attach"}</span>}
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align={iconOnly ? "start" : "end"} sideOffset={10} className="support-attach-menu">
        <DropdownMenuLabel>Attach to message</DropdownMenuLabel>
        <DropdownMenuItem disabled={filesDisabled} onClick={onFiles} title="Images up to 5 MB. PDF, TXT, CSV, DOCX and XLSX up to 10 MB. MP4, MOV and WAV up to 10 MB and 30 seconds."><FileUp /><span><strong>Upload files</strong><small>Images, documents, video or audio</small></span></DropdownMenuItem>
        <DropdownMenuSeparator />
        {Object.entries(TYPES).map(([key, option]) => <DropdownMenuItem key={key} disabled={referencesDisabled} onClick={() => openReference(key)}><option.Icon /><span><strong>{option.label}</strong></span></DropdownMenuItem>)}
      </DropdownMenuContent>
    </DropdownMenu>
    <Dialog open={Boolean(selected)} onOpenChange={open => { if (!open) setType(null); }}>
      <DialogContent className="support-dialog support-start-dialog support-reference-dialog">
        <DialogHeader className="support-start-dialog-header">
          <span className="support-dialog-icon"><Icon aria-hidden="true" /></span>
          <div><DialogTitle>Attach {selected?.label}</DialogTitle><DialogDescription>Share a reference with your support team. Review it before sending your message.</DialogDescription></div>
        </DialogHeader>
        <form className="support-start-dialog-form" onSubmit={event => {
          event.preventDefault();
          event.stopPropagation();
          if (disabled || !value.trim() || (type === "other" && !label.trim())) return;
          if (onAddReference({ type, label: type === "other" ? label.trim() : selected.label, value: value.trim() })) setType(null);
        }}>
          {type === "other" && <div className="support-dialog-field"><label htmlFor="support-reference-label">Reference name</label><Input id="support-reference-label" autoFocus required maxLength={40} value={label} onChange={event => setLabel(event.target.value)} placeholder="e.g. Invoice ID or Order ID" disabled={disabled} /></div>}
          <div className="support-dialog-field"><label htmlFor="support-reference-value">{type === "other" ? "Reference ID" : selected?.label}</label><Input id="support-reference-value" autoFocus={type !== "other"} required maxLength={120} value={value} onChange={event => setValue(event.target.value)} placeholder={selected?.placeholder} disabled={disabled} /></div>
          <div className="support-dialog-actions"><Button type="button" variant="outline" onClick={() => setType(null)}>Cancel</Button><Button type="submit" disabled={disabled || !value.trim() || (type === "other" && !label.trim())}><Paperclip />Add reference</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  </>;
}
