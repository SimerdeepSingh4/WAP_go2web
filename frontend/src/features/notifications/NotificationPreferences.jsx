import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BellRing, ChevronDown, Loader2, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import api from "@/api/client";
import { enableBrowserPush, disableBrowserPush, supportsPush } from "./push";

export default function NotificationPreferences({ preference, user }) {
  const accountId = user.id || user._id;
  const client = useQueryClient();
  const [threshold, setThreshold] = useState(preference.lowBalanceThreshold);
  const [categories, setCategories] = useState(preference.pushCategories);
  const browser = useQuery({ queryKey: ["browserPush", accountId], queryFn: async () => {
    if (!supportsPush() || Notification.permission !== "granted") return false;
    const registration = await navigator.serviceWorker.getRegistration("/");
    return Boolean(registration && await registration.pushManager.getSubscription());
  } });
  const push = useMutation({ mutationFn: async () => browser.data ? disableBrowserPush() : enableBrowserPush(preference.publicKey, accountId), onSuccess: () => client.invalidateQueries({ queryKey: ["browserPush", accountId] }), onError: (error) => toast.add({ title: error.message, type: "error" }) });
  const save = useMutation({ mutationFn: () => api.put("/notifications/preferences", { lowBalanceThreshold: Number(threshold), pushCategories: categories }), onSuccess: () => { client.invalidateQueries({ queryKey: ["notifications", accountId, "preferences"] }); toast.add({ title: "Notification preferences saved", type: "success" }); }, onError: (error) => toast.add({ title: error.message, type: "error" }) });
  return <details data-tour="notification-preferences" className="group overflow-hidden rounded-xl border border-border bg-card"><summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/30 sm:px-5 [&::-webkit-details-marker]:hidden"><span className="flex items-center gap-3"><SlidersHorizontal className="size-4 shrink-0 text-muted-foreground" /><span className="space-y-0.5"><span className="block text-xs font-medium">Notification preferences</span><span className="block text-[11px] text-muted-foreground">Browser alerts and low-balance settings</span></span></span><ChevronDown className="size-3.5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" /></summary><div className="space-y-5 border-t border-border p-4 sm:p-5">
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted/25 p-3"><div><div className="flex flex-wrap items-center gap-2"><p className="text-xs font-medium">Browser notifications</p><span className={`rounded px-1.5 py-0.5 text-[10px] ${browser.data ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" : "bg-muted text-muted-foreground"}`}>{browser.data ? "Enabled" : "Off on this device"}</span></div><p className="mt-1 text-[11px] leading-5 text-muted-foreground">Receive alerts when the dashboard is in the background.</p></div><Button type="button" size="sm" variant="outline" onClick={() => push.mutate()} disabled={push.isPending || browser.isPending || !supportsPush() || !preference.pushAvailable || user.isPreview}>{push.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <BellRing className="size-3.5" />}{browser.data ? "Disable" : "Enable browser alerts"}</Button></div>
    {!supportsPush() && <p className="text-[11px] text-muted-foreground">This browser needs HTTPS and support for browser push. On iPhone or iPad, add the app to the Home Screen first.</p>}
    {!preference.pushAvailable && <p className="text-[11px] text-muted-foreground">Browser push is awaiting server configuration. In-app notifications remain available.</p>}
    <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); save.mutate(); }}>
      <fieldset><legend className="mb-2.5 text-xs font-medium">Browser alert categories</legend><div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{["campaigns", "credits", "accounts", "system"].map((category) => <label key={category} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2.5 text-xs capitalize transition-colors ${categories.includes(category) ? "border-primary/25 bg-primary/[0.025]" : "border-border"}`}><input type="checkbox" disabled={user.isPreview} checked={categories.includes(category)} onChange={(event) => setCategories((previous) => event.target.checked ? [...previous, category] : previous.filter((value) => value !== category))} className="size-3.5 accent-primary" />{category}</label>)}</div></fieldset>
      <div className="flex flex-wrap items-end justify-between gap-4 border-t border-border pt-4"><label className="block space-y-2 text-xs font-medium"><span className="block">Low-balance alert threshold</span><span className="flex items-center gap-2"><Input type="number" min={0} max={100000000} step="0.01" required value={threshold} onChange={(event) => setThreshold(event.target.value)} disabled={user.isPreview} className="h-9 w-32 bg-background focus-visible:ring-2 focus-visible:ring-ring/20" /><span className="text-[11px] font-normal text-muted-foreground">credits</span></span></label><Button type="submit" size="sm" disabled={save.isPending || user.isPreview}>{save.isPending && <Loader2 className="size-3.5 animate-spin" />}Save preferences</Button></div>
      <p className="text-[11px] text-muted-foreground">Set the threshold to 0 to turn off low-balance alerts. In-app history is kept for 90 days.</p>
    </form>
  </div></details>;
}
