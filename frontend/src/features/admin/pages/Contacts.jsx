import { useState, useRef } from "react";
import { UploadCloud, Download, Trash2, Users, FileSpreadsheet, CheckCircle2, AlertCircle, RefreshCw, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { PageHeading, QueryState, SearchBox, DataTable } from "../components/shared";
import { useAdminQuery, useAdminMutation } from "../hooks/useAdmin";
import { number, dateTime } from "../lib/format";
import api from "@/api/client";

export default function Contacts() {
  const [search, setSearch] = useState("");
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [file, setFile] = useState(null);
  const [groupName, setGroupName] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const fileInputRef = useRef(null);

  const contactsQuery = useAdminQuery("contacts");
  const deleteMutation = useAdminMutation("deleteContact", "Contact removed");

  const contacts = contactsQuery.data?.contacts || contactsQuery.data?.data || [];
  const rows = contacts.filter((c) => {
    const text = `${c.name || ""} ${c.phoneNumber || ""} ${c.email || ""} ${c.company || ""} ${c.groupId || ""}`.toLowerCase();
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
      formData.append("groupName", groupName.trim());
    }

    setIsImporting(true);
    try {
      const response = await api.post("/contacts/import-file", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setImportResult(response.data);
      contactsQuery.refetch();
      toast.add({
        title: "Import completed",
        description: `Successfully imported ${response.data.importedCount || 0} contacts.`,
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
      const response = await api.get("/contacts/export", { responseType: "blob" });
      const blob = new Blob([response.data], { type: "text/csv;charset=utf-8;" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `contacts-export-${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
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
      label: "Phone (E.164)",
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
      label: "Group / Tag",
      render: (c) => (
        <div className="flex flex-wrap gap-1">
          {c.groupId ? (
            <span className="inline-flex items-center rounded-md bg-secondary px-2 py-0.5 text-xs text-secondary-foreground font-medium">
              {c.groupId}
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
          onClick={() => deleteMutation.mutate(c._id)}
          title="Delete contact"
        >
          <Trash2 className="size-4" />
        </Button>
      ),
    },
  ];

  return (
    <>
      <PageHeading
        title="Audience & Contacts"
        description="Manage recipient directories, bulk import via Excel/CSV with auto-column mapping, and export audience data."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={handleExportCSV} disabled={!contacts.length}>
              <Download className="size-4 mr-1" />
              Export CSV
            </Button>
            <Button onClick={() => setIsImportOpen(true)}>
              <UploadCloud className="size-4 mr-1" />
              Import Contacts
            </Button>
          </div>
        }
      />

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Card className="rounded-lg shadow-none">
          <CardContent className="p-4 sm:p-5">
            <p className="flex items-center justify-between text-xs text-muted-foreground">
              Total Contacts
              <Users className="size-4" />
            </p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">{number(contacts.length)}</p>
          </CardContent>
        </Card>
        <Card className="rounded-lg shadow-none">
          <CardContent className="p-4 sm:p-5">
            <p className="flex items-center justify-between text-xs text-muted-foreground">
              Audience Groups
              <FileSpreadsheet className="size-4" />
            </p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">
              {number(new Set(contacts.map((c) => c.groupId).filter(Boolean)).size)}
            </p>
          </CardContent>
        </Card>
        <Card className="rounded-lg shadow-none col-span-2 sm:col-span-1">
          <CardContent className="p-4 sm:p-5">
            <p className="flex items-center justify-between text-xs text-muted-foreground">
              Database Sanitization
              <CheckCircle2 className="size-4 text-emerald-600" />
            </p>
            <p className="mt-2 text-sm font-medium text-emerald-800">E.164 Validated</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <SearchBox value={search} onChange={setSearch} label="Search name, phone, email, group..." />
        {search && (
          <Button variant="ghost" onClick={() => setSearch("")}>
            Clear
          </Button>
        )}
      </div>

      <QueryState
        query={contactsQuery}
        empty={!contacts.length}
        emptyTitle="No contacts found"
        emptyDescription="Import a CSV or Excel file to populate your recipient audience."
      >
        <DataTable
          caption="Recipient Contacts Table"
          rows={rows}
          columns={columns}
          emptyTitle="No matching contacts"
        />
      </QueryState>

      {/* Import File Dialog */}
      <Dialog open={isImportOpen} onOpenChange={setIsImportOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Import Audience Contacts</DialogTitle>
            <DialogDescription>
              Upload a <strong>.csv</strong> or <strong>.xlsx</strong> file. Columns like Name, Phone, Email, Company, and Tags are automatically detected and sanitized to E.164.
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
              <Label htmlFor="group-name">Target Group / Tag (Optional)</Label>
              <Input
                id="group-name"
                placeholder="e.g. VIP Customers, Diwali 2026 Promo"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Attaches an audience tag to all valid contacts in this batch.
              </p>
            </div>

            {importResult && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-4 space-y-1.5 text-xs text-emerald-900">
                <p className="font-semibold text-sm flex items-center gap-1.5 text-emerald-800">
                  <CheckCircle2 className="size-4" /> Import Complete
                </p>
                <p><strong>{importResult.importedCount}</strong> new contacts added.</p>
                {importResult.duplicatesCount > 0 && (
                  <p><strong>{importResult.duplicatesCount}</strong> duplicate numbers skipped.</p>
                )}
                {importResult.invalidCount > 0 && (
                  <p className="text-amber-800">
                    <AlertCircle className="size-3.5 inline mr-1" />
                    <strong>{importResult.invalidCount}</strong> invalid phone numbers discarded.
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
                  "Start Import"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

