import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { useResellerMutation } from "../hooks/useReseller";
import { Field, FilterSelect, FormError } from "@/features/admin/components/shared";

export default function ResellerActionForm({ title, description, action, successMessage, fields, initialValues, validate, payload, review, onClose, submitLabel = "Confirm changes" }) {
  const submitting = useRef(false);
  const [values, setValues] = useState(initialValues);
  const [reviewing, setReviewing] = useState(false);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState("");
  const mutation = useResellerMutation(action, successMessage, onClose);
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
      else if (field.maxLength && value.length > field.maxLength) invalid[field.key] = `Use at most ${field.maxLength} characters.`;
    }
    const message = Object.values(invalid)[0] || validate?.(values) || "";
    setErrors(invalid); setError(message);
    if (message) { toast.add({ title: "Check the form", description: message, type: "error" }); return; }
    setReviewing(true);
  }
  return <Dialog open onOpenChange={(open) => { if (!open && !mutation.isPending) onClose(); }}><DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg" showCloseButton={!mutation.isPending}>
    <DialogHeader><DialogTitle>{reviewing ? `Review: ${title.toLowerCase()}` : title}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader>
    <form onSubmit={submit} noValidate className="space-y-4">
      {reviewing ? <div className="space-y-3 rounded-md border bg-muted/50 p-4 text-sm">{review(values)}</div> : fields.map((field) => <Field key={field.key} id={`reseller-${field.key}`} label={field.label} hint={field.hint}>
        {field.options ? <FilterSelect id={`reseller-${field.key}`} label={field.label} value={values[field.key]} onChange={(value) => change(field.key, value)} options={field.options} /> : field.type === "textarea" ? <Textarea id={`reseller-${field.key}`} value={values[field.key]} onChange={(e) => change(field.key, e.target.value)} maxLength={field.maxLength} aria-invalid={Boolean(errors[field.key])} aria-describedby={errors[field.key] ? `error-${field.key}` : undefined} rows={3} /> : <Input id={`reseller-${field.key}`} type={field.type || "text"} min={field.min} step={field.step} value={values[field.key]} onChange={(e) => change(field.key, e.target.value)} autoComplete={field.type === "password" ? "new-password" : "off"} maxLength={field.maxLength} aria-required={field.required} aria-invalid={Boolean(errors[field.key])} aria-describedby={errors[field.key] ? `error-${field.key}` : field.hint ? `reseller-${field.key}-hint` : undefined} />}
        {errors[field.key] && <p id={`error-${field.key}`} className="text-xs text-destructive">{errors[field.key]}</p>}
      </Field>)}
      <FormError message={error || mutation.error?.message} />
      <div className="flex flex-wrap justify-end gap-2 border-t pt-4"><Button type="button" variant="outline" disabled={mutation.isPending} onClick={() => reviewing ? setReviewing(false) : onClose()}>{reviewing ? "Back" : "Cancel"}</Button><Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? "Saving…" : reviewing ? submitLabel : "Review changes"}</Button></div>
    </form>
  </DialogContent></Dialog>;
}
