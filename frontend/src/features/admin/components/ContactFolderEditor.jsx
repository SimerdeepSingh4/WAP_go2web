import { useId, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import api from "@/api/client";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { useContactFolders } from "../hooks/useContactFolders";

const fieldClass = "h-8 w-full min-w-0 border-0! bg-transparent px-0 text-xs outline-none! ring-0! shadow-none! placeholder:text-muted-foreground disabled:opacity-50";

export default function ContactFolderEditor({ onClose, onSaved, phoneNumbers = [], suggestedName = "", endpoint = "/contacts/save-to-folder", manualInput = false, initialFolderId = "", folderOnly = false }) {
  const id = useId();
  const client = useQueryClient();
  const folders = useContactFolders(!folderOnly);
  const [folderId, setFolderId] = useState(initialFolderId || "new");
  const [name, setName] = useState(suggestedName.slice(0, 100));
  const [input, setInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async (event) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const response = folderOnly
        ? await api.post("/groups", { name: name.trim(), description: "Numbers saved by a super admin" })
        : await api.post(endpoint, {
          phoneNumbers: manualInput ? input : phoneNumbers,
          ...(folderId === "new" ? { newFolderName: name.trim() } : { groupId: folderId }),
        });
      const data = response.data.data;
      toast.add({ title: folderOnly ? "Folder created" : `${data.addedCount} contacts saved`, description: !folderOnly && data.skippedCount ? `${data.skippedCount} already in this folder.` : undefined, type: "success" });
      await Promise.all([
        client.invalidateQueries({ queryKey: ["contact-folders"] }),
        client.invalidateQueries({ queryKey: ["admin"] }),
      ]);
      onSaved?.(folderOnly ? data : data.folder);
      onClose();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  return <form aria-label={folderOnly ? "Create contact folder" : "Save numbers to Contacts"} onSubmit={save}
    onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); if (!saving) onClose(); } }}
    className={`py-3 ${folderOnly ? "flex flex-wrap items-center gap-3" : "max-w-md space-y-3"}`}>
    {!folderOnly && <div className="flex items-center gap-3">
      <label htmlFor={`${id}-folder`} className="shrink-0 text-xs text-muted-foreground">Save to</label>
      <select id={`${id}-folder`} value={folderId} disabled={saving} onChange={(event) => setFolderId(event.target.value)} className={fieldClass}>
        <option value="new">Create folder...</option>
        {(folders.data || []).map((folder) => <option key={folder._id} value={folder._id}>{folder.name}</option>)}
      </select>
    </div>}
    {(folderOnly || folderId === "new") && <div className={folderOnly ? "w-full max-w-xs" : ""}>
      <label htmlFor={`${id}-name`} className="sr-only">Folder name</label>
      <input id={`${id}-name`} autoFocus={folderOnly || !manualInput} value={name} onChange={(event) => setName(event.target.value)} required maxLength={100} disabled={saving} placeholder="Folder name, e.g. user's name" className={fieldClass} />
    </div>}
    {!folderOnly && folders.isError && <p role="alert" className="text-xs text-destructive">Could not load folders. <button type="button" className="underline" onClick={() => folders.refetch()}>Retry</button></p>}
    {manualInput && <div>
      <label htmlFor={`${id}-numbers`} className="sr-only">Phone numbers</label>
      <textarea id={`${id}-numbers`} autoFocus value={input} onChange={(event) => setInput(event.target.value)} required rows={3} disabled={saving}
        className="max-h-36 w-full resize-y border-0 border-b border-input bg-transparent py-2 font-mono text-xs outline-none placeholder:text-muted-foreground focus:border-foreground" placeholder="Paste numbers with country codes, one per line" />
    </div>}
    {error && <p role="alert" className="w-full text-xs text-destructive">{error}</p>}
    <div className="flex items-center gap-1">
      <Button type="submit" size="xs" disabled={saving || ((folderOnly || folderId === "new") && !name.trim()) || (manualInput && !input.trim()) || (!manualInput && !folderOnly && !phoneNumbers.length)}>
        {saving && <Loader2 className="size-3 animate-spin" />}{folderOnly ? "Create folder" : "Save"}
      </Button>
      <Button type="button" size="xs" variant="ghost" disabled={saving} onClick={onClose}>Cancel</Button>
    </div>
  </form>;
}
