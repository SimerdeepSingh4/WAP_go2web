import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, X } from "lucide-react";
import api from "@/api/client";
import { Button } from "@/components/ui/button";

export default function TrackedNumberNote({ campaignId, row }) {
  const client = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState("");
  const save = useMutation({
    mutationFn: () => api.patch(`/campaigns/${campaignId}/tracked-numbers/${encodeURIComponent(row.phoneNumber)}`, { note }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["tracked-numbers"] });
      setEditing(false);
    },
  });
  if (!editing) return <button type="button" onClick={() => { setNote(row.note); save.reset(); setEditing(true); }}
    aria-label={`Edit note for ${row.phoneNumber}`} title={row.note || undefined}
    className="mt-1 block max-w-full truncate text-left text-[11px] text-muted-foreground hover:text-foreground hover:underline focus-visible:underline focus-visible:outline-none">
    {row.note || "Add note"}
  </button>;

  return <form className="mt-1" onSubmit={(event) => { event.preventDefault(); if (!save.isPending) save.mutate(); }}
    onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); if (!save.isPending) setEditing(false); } }}>
    <div className="flex items-center gap-1">
      <input autoFocus aria-label={`Note for ${row.phoneNumber}`} maxLength={500} disabled={save.isPending} value={note} onChange={(event) => setNote(event.target.value)}
        className="h-7 min-w-0 flex-1 border-0 border-b border-input bg-transparent text-xs outline-none focus:border-foreground" placeholder="Add a note" />
      <Button type="submit" size="icon-xs" variant="ghost" aria-label="Save note" disabled={save.isPending}>{save.isPending ? <Loader2 className="animate-spin" /> : <Check />}</Button>
      <Button type="button" size="icon-xs" variant="ghost" aria-label="Cancel note edit" disabled={save.isPending} onClick={() => setEditing(false)}><X /></Button>
    </div>
    {save.isError && <p role="alert" className="mt-1 text-[11px] text-destructive">{save.error.message}</p>}
  </form>;
}
