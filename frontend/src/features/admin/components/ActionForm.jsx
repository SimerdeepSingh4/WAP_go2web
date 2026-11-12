import { AccountCreationFields, AccountCreationPassword, accountCreationLabel, accountCreationPlaceholders } from "@/components/dashboard/AccountCreationFields";
import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { useAdminMutation } from "../hooks/useAdmin";
import { Field, FilterSelect, FormError } from "./shared";
import { readCampaignDraft, removeCampaignDraft, writeCampaignDraft } from "@/features/campaigns/lib/draftStorage";

export default function ActionForm({ title, description, action, successMessage, fields, initialValues, validate, payload, review, onClose, submitLabel = "Confirm changes", draftKey }) {
  const submitting = useRef(false);
  const draftSaveTimer = useRef(null);
  const [values, setValues] = useState(initialValues);
  const [draftReady, setDraftReady] = useState(!draftKey);
  const [reviewing, setReviewing] = useState(false);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState("");
  const mutation = useAdminMutation(action, successMessage, async (data) => {
    if (draftKey) await removeCampaignDraft(draftKey).catch(() => {});
    onClose?.(data);
  });
  useEffect(() => {
    if (!draftKey) return undefined;
    let active = true;
    readCampaignDraft(draftKey).then((draft) => {
      if (!active) return;
      if (draft?.values) {
        setValues(draft.values);
        toast.add({ title: "Unfinished report edits restored", type: "info" });
      }
      setDraftReady(true);
    }).catch(() => {
      if (active) setDraftReady(true);
    });
    return () => { active = false; };
  }, [draftKey]);
  useEffect(() => {
    if (!draftKey || !draftReady) return undefined;
    window.clearTimeout(draftSaveTimer.current);
    if (JSON.stringify(values) === JSON.stringify(initialValues)) {
      removeCampaignDraft(draftKey).catch(() => {});
      return undefined;
    }
    draftSaveTimer.current = window.setTimeout(() => {
      writeCampaignDraft(draftKey, { values }).catch(() => {});
    }, 250);
    return () => window.clearTimeout(draftSaveTimer.current);
  }, [draftKey, draftReady, values, initialValues]);
  function change(key, value) { setValues((old) => ({ ...old, [key]: value })); setErrors((old) => ({ ...old, [key]: undefined })); setError(""); mutation.reset(); }
  function submit(event) {
    event.preventDefault();
    if (submitting.current) return;
    if (reviewing) { submitting.current = true; mutation.mutate(payload(values), { onSettled: () => { submitting.current = false; } }); return; }
    const invalid = {};
    for (const field of fields) {
      const value = String(values[field.key] ?? "");
      if (field.required && !value.trim()) invalid[field.key] = `${field.label} is required.`;
      else if (value && field.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) invalid[field.key] = "Enter a valid email address.";
      else if (field.type === "number" && value && (!Number.isFinite(Number(value)) || (field.min != null && Number(value) < field.min))) invalid[field.key] = `Enter a number of at least ${field.min ?? 0}.`;
      else if (field.type === "tel" && value && !/^\+?\d{7,15}$/.test(value.trim().replace(/[\s().-]/g, ""))) invalid[field.key] = "Enter a phone number with 7 to 15 digits, including country code.";
      else if (field.maxLength && value.length > field.maxLength) invalid[field.key] = `Use at most ${field.maxLength} characters.`;
    }
    const message = Object.values(invalid)[0] || validate?.(values) || "";
    setErrors(invalid); setError(message);
    if (message) { toast.add({ title: "Check the form", description: message, type: "error" }); return; }
    setReviewing(true);
  }
  const isAccountForm = ["createAccount", "updateAccount"].includes(action) && fields.some(field => field.key === "username");
  function renderField(field) {
    if (field.type === "checkbox") {
      return <label key={field.key} className="flex items-start gap-3 rounded-md border p-3 text-sm">
        <input id={`admin-${field.key}`} type="checkbox" checked={Boolean(values[field.key])} onChange={(e) => change(field.key, e.target.checked)} className="mt-0.5 size-4 accent-primary" />
        <span className="min-w-0"><span className="block font-medium">{field.label}</span>{field.hint && <span className="mt-1 block text-xs text-muted-foreground">{field.hint}</span>}</span>
      </label>;
    }
    const Control = isAccountForm && field.type === "password" ? AccountCreationPassword : Input;
    return <Field key={field.key} id={`admin-${field.key}`} label={isAccountForm ? accountCreationLabel(field.label) : field.label} hint={field.hint}>
        {field.options ? <FilterSelect id={`admin-${field.key}`} label={field.label} value={values[field.key]} onChange={(value) => change(field.key, value)} options={field.options} accountSearch={field.key === "resellerId" ? { role: "Reseller" } : ["toUserId", "fromUserId", "userId"].includes(field.key) ? { active: true, purpose: "credits" } : undefined} /> : field.type === "textarea" ? <Textarea id={`admin-${field.key}`} value={values[field.key]} onChange={(e) => change(field.key, e.target.value)} maxLength={field.maxLength} aria-invalid={Boolean(errors[field.key])} aria-describedby={errors[field.key] ? `error-${field.key}` : undefined} rows={3} /> : <Control placeholder={isAccountForm ? accountCreationPlaceholders[field.key] : undefined} id={`admin-${field.key}`} type={field.type || "text"} min={field.min} step={field.step} value={values[field.key]} onChange={(e) => change(field.key, e.target.value)} autoComplete={field.type === "password" ? "new-password" : "off"} maxLength={field.maxLength} aria-required={field.required} aria-invalid={Boolean(errors[field.key])} aria-describedby={errors[field.key] ? `error-${field.key}` : field.hint ? `admin-${field.key}-hint` : undefined} />}
        {errors[field.key] && <p id={`error-${field.key}`} className="text-xs text-destructive">{errors[field.key]}</p>}
      </Field>;
  }
  return <Dialog open onOpenChange={(open) => { if (!open && !mutation.isPending) onClose(); }}><DialogContent className={isAccountForm ? "account-create-dialog" : "max-h-[90svh] overflow-y-auto sm:max-w-lg"} showCloseButton={!mutation.isPending}>
    <DialogHeader><DialogTitle>{reviewing ? `Review: ${title.toLowerCase()}` : title}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader>
    <form onSubmit={submit} noValidate className={isAccountForm ? "account-create-form" : "space-y-4"}>
      <div className={isAccountForm ? "account-create-body" : "space-y-4"}>
      {reviewing ? <div className="space-y-3 rounded-md border bg-muted/50 p-4 text-sm">{review(values)}</div> : (isAccountForm ? <AccountCreationFields fields={fields} renderField={renderField} /> : fields.map(renderField))}
      <FormError message={error || mutation.error?.message} />
      </div>
      <div className={isAccountForm ? "account-create-footer" : "flex flex-wrap justify-end gap-2 border-t pt-4"}>{isAccountForm && <span>{action === "createAccount" ? "Review the details before creating the account." : "Review your changes before saving."}</span>}<div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" disabled={mutation.isPending} onClick={() => reviewing ? setReviewing(false) : onClose()}>{reviewing ? "Back" : "Cancel"}</Button><Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? "Saving…" : reviewing ? submitLabel : isAccountForm ? "Review account" : "Review changes"}</Button></div></div>
    </form>
  </DialogContent></Dialog>;
}
