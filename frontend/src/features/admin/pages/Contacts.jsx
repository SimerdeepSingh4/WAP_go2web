import { useState, useRef, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, UploadCloud, Download, Trash2, CheckCircle2, AlertCircle, RefreshCw, Plus, Copy, User, Calendar, Users, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { QueryState, DataTable, Pager } from "../../dashboard/components/shared";
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
        <div className="flex items-center gap-2.5">
          <div className="size-7 rounded-full bg-muted/90 border border-border/70 flex items-center justify-center shrink-0 text-muted-foreground font-semibold text-[11px]">
            {c.name ? c.name.charAt(0).toUpperCase() : <User className="size-3.5 text-muted-foreground/60" />}
          </div>
          <div className="min-w-0">
            <p className="font-medium text-xs text-foreground leading-tight">
              {c.name || <span className="text-muted-foreground/50 font-normal italic">No name</span>}
            </p>
            {c.company && <p className="text-[11px] text-muted-foreground truncate">{c.company}</p>}
          </div>
        </div>
      ),
    },
    {
      key: "phone",
      label: "Phone number",
      sort: (c) => c.phoneNumber,
      render: (c) => (
        <div className="inline-flex items-center gap-1.5 group/phone">
          <span className="tabular-nums font-mono text-xs font-semibold text-foreground tracking-tight">
            {c.phoneNumber}
          </span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              navigator.clipboard?.writeText(c.phoneNumber);
              toast.add({ title: "Phone number copied", type: "success" });
            }}
            title="Copy phone number"
            className="opacity-0 group-hover/phone:opacity-100 hover:text-foreground text-muted-foreground transition-opacity p-0.5 rounded hover:bg-muted"
          >
            <Copy className="size-3" />
          </button>
        </div>
      ),
    },
    {
      key: "email",
      label: "Email",
      render: (c) => (
        <span className={`text-xs ${c.email ? "text-foreground/80 font-normal" : "text-muted-foreground/50"}`}>
          {c.email || "—"}
        </span>
      ),
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
      render: (c) => (
        <span className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Calendar className="size-3 text-muted-foreground/50" />
          {dateTime(c.createdAt)}
        </span>
      ),
    },
    {
      key: "actions",
      label: <span className="sr-only">Actions</span>,
      className: "text-right",
      render: (c) => (
        <Button
          variant="ghost"
          size="icon-xs"
          className="size-7 text-muted-foreground/70 hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors"
          onClick={() => { deleteMutation.reset(); setDeleting(c); }}
          aria-label={`Delete ${c.name || c.phoneNumber}`}
          title="Remove contact"
        >
          <Trash2 className="size-3.5" />
        </Button>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-3 sm:gap-3.5 max-w-full -mt-2 sm:-mt-3">
      {!showingFolders && (
        <div className="flex items-center gap-1.5 -mb-1">
          <button
            type="button"
            onClick={backToFolders}
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-colors -ml-1 group"
          >
            <ArrowLeft className="size-3.5 transition-transform group-hover:-translate-x-0.5" />
            <span>Contact folders</span>
          </button>
          <span className="text-muted-foreground/30 text-xs">/</span>
          <span className="text-xs text-foreground font-semibold truncate max-w-[240px]">
            {folderTitle || "Folder"}
          </span>
        </div>
      )}

      {/* Header section */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-0.5">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
              {showingFolders ? "Contacts" : activeFolderId ? folderTitle || "Contact folder" : "All numbers"}
            </h1>
            {!showingFolders && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                <Users className="size-3" />
                {rows.length} {rows.length === 1 ? "contact" : "contacts"}
              </span>
            )}
            {activeFolder?.sourceUserId?.role && (
              <span className="inline-flex items-center rounded-md bg-secondary px-2 py-0.5 text-[11px] font-medium text-secondary-foreground">
                {activeFolder.sourceUserId.role}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs sm:text-sm text-muted-foreground">
            {showingFolders
              ? "Numbers saved by you, organized by campaign owner."
              : activeFolder?.sourceUserId
              ? `Saved numbers from ${folderTitle}'s campaigns.`
              : "Saved contact numbers."}
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {!showingFolders && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCSV}
              disabled={!rows.length}
              className="h-8.5 gap-1.5 text-xs font-medium"
            >
              <Download className="size-3.5" />
              Export CSV
            </Button>
          )}
          <Button
            size="sm"
            onClick={() => setIsImportOpen(true)}
            className="h-8.5 gap-1.5 text-xs font-medium bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs"
          >
            <UploadCloud className="size-3.5" />
            Import contacts
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setFolderEditor("contacts")}
            className="h-8.5 gap-1.5 text-xs font-medium"
          >
            <Plus className="size-3.5" />
            Add numbers
          </Button>
        </div>
      </div>

      {/* Toolbar: Search & View Switches */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-border/70 pb-3">
        <div className="flex flex-1 items-center gap-2 min-w-[240px] max-w-sm">
          <div className="relative w-full">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
            <Input
              className="h-8.5 pl-8 pr-8 text-xs bg-card"
              placeholder={showingFolders ? "Search users, resellers or saved numbers..." : "Search saved numbers, names, emails..."}
              value={search}
              onChange={(e) => changeSearch(e.target.value)}
            />
            {search && (
              <button
                type="button"
                onClick={() => changeSearch("")}
                className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground p-0.5"
                title="Clear search"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {showingFolders && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8.5 text-xs"
              onClick={() => { setSearch(""); setParams({ view: "all" }); }}
            >
              All numbers
            </Button>
          )}
          {showingFolders && (
            <Button
              variant="outline"
              size="sm"
              className="h-8.5 gap-1 text-xs"
              onClick={() => setFolderEditor("folder")}
            >
              <Plus className="size-3.5" />
              Create folder
            </Button>
          )}
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
          compact={true}
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
    </div>
  );
}

