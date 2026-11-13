import { useState, useRef, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, UploadCloud, Download, Trash2, CheckCircle2, AlertCircle, RefreshCw, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { PageHeading, QueryState, SearchBox, DataTable, Pager } from "../../dashboard/components/shared";
import { useAdminQuery, useAdminMutation } from "../hooks/useAdmin";
import { dateTime } from "../../../lib/format";
import api from "@/api/client";
import { useSearchParams } from "react-router";
import { useContactFolderPage, useContactFolderDetail } from "../hooks/useContactFolders";
import ContactFolderEditor from "../components/ContactFolderEditor";
import ContactFolderCard from "../components/ContactFolderCard";

export default function Contacts() {
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const activeFolderId = params.get("folder") || "";
  const showingFolders = !activeFolderId && params.get("view") !== "all";
  const [folderEditor, setFolderEditor] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [deletingFolder, setDeletingFolder] = useState(null);
  const [search, setSearch] = useState("");
  const [folderPage, setFolderPage] = useState(1);
  const [folderSearch, setFolderSearch] = useState("");
  useEffect(() => {
    const timer = window.setTimeout(() => setFolderSearch(search.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [search]);
  const foldersQuery = useContactFolderPage(folderPage, folderSearch, showingFolders);
  const folderDetailQuery = useContactFolderDetail(activeFolderId);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [file, setFile] = useState(null);
  const [groupName, setGroupName] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const fileInputRef = useRef(null);

  const contactFilters = { owned: "true", ...(activeFolderId ? { groupId: activeFolderId } : { saved: "true" }) };
  const contactsQuery = useAdminQuery("contacts", contactFilters, !showingFolders);
  const deleteMutation = useAdminMutation("deleteContact", "Contact removed", () => { setDeleting(null); queryClient.invalidateQueries({ queryKey: ["contact-folders"] }); });
  const deleteFolderMutation = useAdminMutation("deleteFolder", "Folder deleted", () => {
    if (activeFolderId === deletingFolder?._id) setParams({});
    setDeletingFolder(null);
    queryClient.invalidateQueries({ queryKey: ["contact-folders"] });
  });

  const contacts = contactsQuery.data?.contacts || contactsQuery.data?.data || [];
  const activeFolder = folderDetailQuery.data;
  const folderTitle = activeFolder?.sourceUserId?.username || activeFolder?.name;
  const visibleFolders = foldersQuery.data?.data || [];
  const folderPagination = foldersQuery.data?.pagination;
  const changeSearch = (value) => { setSearch(value); setFolderPage(1); };
  const openFolder = (id) => { setSearch(""); setFolderEditor(null); setParams({ folder: id }); };
  const backToFolders = () => { setSearch(""); setFolderEditor(null); setParams({}); };
  const rows = contacts.filter((c) => {
    if (activeFolderId && String(c.groupId?._id || c.groupId || "") !== activeFolderId) return false;
    const text = `${c.name || ""} ${c.phoneNumber || ""} ${c.email || ""} ${c.company || ""} ${c.groupId?.name || ""}`.toLowerCase();
    return text.includes(search.toLowerCase());
  });

  const handleFileChange = (e) => {
    const selected = e.target.files?.[0];
    if (selected) {
      setFile(selected);
      setImportResult(null);
    }
  };

  const handleImportSubmit = async (e) => {
    e.preventDefault();
    if (!file) {
      toast.add({ title: "Please choose a file", type: "error" });
      return;
    }

    const formData = new FormData();
    formData.append("file", file);
    if (groupName.trim()) {
      formData.append("newGroupName", groupName.trim());
    } else if (activeFolderId) {
      formData.append("groupId", activeFolderId);
    }

    if (isImporting) return;
    setIsImporting(true);
    try {
      const response = await api.post("/contacts/import-file", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setImportResult(response.data);
      if (response.data.summary?.group?.id) openFolder(response.data.summary.group.id);
      contactsQuery.refetch();
      queryClient.invalidateQueries({ queryKey: ["contact-folders"] });
      toast.add({
        title: "Import completed",
        description: `Successfully imported ${response.data.summary?.importedCount || 0} contacts.`,
        type: "success",
      });
    } catch (err) {
      toast.add({
        title: "Import failed",
        description: err.response?.data?.message || err.message,
        type: "error",
      });
    } finally {
      setIsImporting(false);
    }
  };

  const handleExportCSV = async () => {
    try {
      const response = await api.get("/contacts/export", { responseType: "blob", params: contactFilters });
      const blob = new Blob([response.data], { type: "text/csv;charset=utf-8;" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `contacts-export-${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.add({ title: "Contacts exported to CSV", type: "success" });
    } catch (err) {
      toast.add({ title: "Export failed", description: err.message, type: "error" });
    }
  };

  const columns = [
    {
      key: "name",
      label: "Name",
      sort: (c) => c.name || "",
      render: (c) => (
        <div>
          <p className="font-medium">{c.name || "—"}</p>
          {c.company && <p className="text-xs text-muted-foreground">{c.company}</p>}
        </div>
      ),
    },
    {
      key: "phone",
      label: "Phone number",
      sort: (c) => c.phoneNumber,
      render: (c) => <span className="tabular-nums font-mono text-xs">{c.phoneNumber}</span>,
    },
    {
      key: "email",
      label: "Email",
      render: (c) => <span className="text-muted-foreground text-xs">{c.email || "—"}</span>,
    },
    {
      key: "group",
      label: "Folder / Tag",
      render: (c) => (
        <div className="flex flex-wrap gap-1">
          {c.groupId ? (
            <span className="inline-flex items-center rounded-md bg-secondary px-2 py-0.5 text-xs text-secondary-foreground font-medium">
              {c.groupId?.name || "Group name unavailable"}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
          {c.tags?.map((t, idx) => (
            <span key={idx} className="inline-flex items-center rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
              {t}
            </span>
          ))}
        </div>
      ),
    },
    {
      key: "createdAt",
      label: "Added",
      sort: (c) => new Date(c.createdAt).getTime(),
      render: (c) => <span className="text-xs text-muted-foreground">{dateTime(c.createdAt)}</span>,
    },
    {
      key: "actions",
      label: <span className="sr-only">Actions</span>,
      className: "text-right",
      render: (c) => (
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground hover:text-destructive"
          onClick={() => { deleteMutation.reset(); setDeleting(c); }}
          aria-label={`Delete ${c.name || c.phoneNumber}`}
        >
          <Trash2 className="size-4" />
        </Button>
      ),
    },
  ];

  return (
    <>
      {!showingFolders && <button type="button" onClick={backToFolders} className="mb-1 inline-flex w-fit items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"><ArrowLeft className="size-3.5" />Contact folders</button>}
      <PageHeading
        title={showingFolders ? "Contacts" : activeFolderId ? folderTitle || "Contact folder" : "All numbers"}
        description={showingFolders ? "Numbers saved by you, organized by campaign owner." : activeFolder?.sourceUserId ? `Saved numbers from ${folderTitle}'s campaigns.` : "Saved contact numbers."}
        action={
          <div className="flex flex-wrap items-center gap-2">
            {!showingFolders && <Button variant="outline" onClick={handleExportCSV} disabled={!rows.length}>
              <Download className="size-4 mr-1" />
              Export CSV
            </Button>}
            <Button onClick={() => setIsImportOpen(true)}>
              <UploadCloud className="size-4 mr-1" />
              Import contacts
            </Button>
          </div>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <div className="flex flex-wrap items-center gap-2"><SearchBox value={search} onChange={changeSearch} label={showingFolders ? "Search users, resellers or saved numbers" : "Search saved numbers"} />{search && <Button size="xs" variant="ghost" onClick={() => changeSearch("")}>Clear</Button>}</div>
        <div className="flex flex-wrap items-center gap-1">
          {showingFolders && <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setParams({ view: "all" }); }}>All numbers</Button>}
          {showingFolders && <Button variant="ghost" size="sm" onClick={() => setFolderEditor("folder")}><Plus className="size-3.5" />Create folder</Button>}
          <Button variant="ghost" size="sm" onClick={() => setFolderEditor("contacts")}><Plus className="size-3.5" />Add numbers</Button>
        </div>
      </div>
      {folderEditor && <ContactFolderEditor key={`${folderEditor}:${activeFolderId}`} folderOnly={folderEditor === "folder"} manualInput={folderEditor === "contacts"} initialFolderId={activeFolderId} onClose={() => setFolderEditor(null)} onSaved={(folder) => openFolder(folder._id)} />}

      {showingFolders ? <QueryState query={foldersQuery} empty={!visibleFolders.length} emptyTitle={search ? "No matching folders" : "No saved folders yet"} emptyDescription={search ? "Try a user's name or a phone number." : "Save numbers from a campaign to create a folder named after that user."}>
        <section aria-label="Saved contact folders" className="grid grid-cols-[repeat(auto-fill,minmax(0,min(100%,300px)))] gap-8 py-4">
          {visibleFolders.map((folder) => <ContactFolderCard key={folder._id} title={folder.sourceUserId?.username || folder.name}
            subtitle={folder.sourceUserId?.email || (folder.sourceUserId ? "Saved campaign numbers" : "Admin contact list")}
            resellerName={folder.sourceUserId?.role === "Reseller" ? folder.sourceUserId.username : folder.sourceUserId?.resellerId?.username}
            hasSourceUser={Boolean(folder.sourceUserId)}
            count={folder.totalContacts || 0} previewNumbers={folder.previewNumbers || []} onOpen={() => openFolder(folder._id)}
            onDelete={() => { deleteFolderMutation.reset(); setDeletingFolder(folder); }} />)}
        </section>
        {folderPagination && <Pager page={folderPagination.page} totalPages={folderPagination.totalPages} total={folderPagination.total} onChange={setFolderPage} disabled={foldersQuery.isFetching} />}
      </QueryState> : <QueryState
        query={contactsQuery}
        empty={!contacts.length}
        emptyTitle="No contacts found"
        emptyDescription="Add numbers manually, import a file, or save tracked numbers from a campaign."
      >
        <DataTable
          key={activeFolderId || "all"}
          caption="Recipient Contacts Table"
          rows={rows}
          columns={activeFolderId ? columns.filter((column) => column.key !== "group") : columns}
          emptyTitle="No matching contacts"
        />
      </QueryState>}

      <Dialog open={Boolean(deleting)} onOpenChange={(open) => { if (!open && !deleteMutation.isPending) setDeleting(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Remove contact?</DialogTitle><DialogDescription>Remove {deleting?.phoneNumber} from Contacts. Campaign recipients and the tracked list will remain unchanged.</DialogDescription></DialogHeader>
          {deleteMutation.isError && <p role="alert" className="text-sm text-destructive">{deleteMutation.error.message}</p>}
          <DialogFooter><Button variant="outline" disabled={deleteMutation.isPending} onClick={() => setDeleting(null)}>Cancel</Button><Button variant="destructive" disabled={deleteMutation.isPending} onClick={() => deleteMutation.mutate(deleting._id)}>{deleteMutation.isPending ? "Removing…" : "Remove contact"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deletingFolder)} onOpenChange={(open) => { if (!open && !deleteFolderMutation.isPending) setDeletingFolder(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Delete folder?</DialogTitle><DialogDescription>Delete the folder {deletingFolder?.sourceUserId?.username || deletingFolder?.name}? Its saved numbers will remain available under All numbers.</DialogDescription></DialogHeader>
          {deleteFolderMutation.isError && <p role="alert" className="text-sm text-destructive">{deleteFolderMutation.error.message}</p>}
          <DialogFooter><Button variant="outline" disabled={deleteFolderMutation.isPending} onClick={() => setDeletingFolder(null)}>Cancel</Button><Button variant="destructive" disabled={deleteFolderMutation.isPending} onClick={() => deleteFolderMutation.mutate(deletingFolder._id)}>{deleteFolderMutation.isPending ? "Deleting..." : "Delete folder"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import File Dialog */}
      <Dialog open={isImportOpen} onOpenChange={setIsImportOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Import Audience Contacts</DialogTitle>
            <DialogDescription>
              Upload a <strong>.csv</strong> or <strong>.xlsx</strong> file. Columns like Name, Phone, Email, Company, and Tags are automatically detected.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleImportSubmit} className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="contact-file">File (.csv, .xlsx, .xls)</Label>
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:bg-muted/50 transition-colors border-muted-foreground/30"
              >
                <UploadCloud className="size-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm font-medium">
                  {file ? file.name : "Click to select a CSV or Excel spreadsheet"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {file ? `${(file.size / 1024).toFixed(1)} KB` : "Supports drag & drop or file browse"}
                </p>
                <input
                  ref={fileInputRef}
                  id="contact-file"
                  type="file"
                  accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="group-name">New folder name (optional)</Label>
              <Input
                id="group-name"
                placeholder="e.g. VIP Customers, Diwali 2026 Promo"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Creates a folder for this import. Leave blank to use the selected folder.
              </p>
            </div>

            {importResult && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-4 space-y-1.5 text-xs text-emerald-900">
                <p className="font-semibold text-sm flex items-center gap-1.5 text-emerald-800">
                  <CheckCircle2 className="size-4" /> Import Complete
                </p>
                <p><strong>{importResult.summary?.importedCount}</strong> new contacts added.</p>
                {importResult.summary?.duplicateCount > 0 && (
                  <p><strong>{importResult.summary.duplicateCount}</strong> duplicate numbers skipped.</p>
                )}
                {importResult.summary?.invalidCount > 0 && (
                  <p className="text-amber-800">
                    <AlertCircle className="size-3.5 inline mr-1" />
                    <strong>{importResult.summary.invalidCount}</strong> invalid phone numbers discarded.
                  </p>
                )}
              </div>
            )}

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setIsImportOpen(false)}>
                Close
              </Button>
              <Button type="submit" disabled={!file || isImporting}>
                {isImporting ? (
                  <>
                    <RefreshCw className="size-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  "Import contacts"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

