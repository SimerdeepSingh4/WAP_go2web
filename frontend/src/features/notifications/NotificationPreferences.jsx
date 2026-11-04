import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BellRing, Loader2 } from "lucide-react";
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
  return <details className="group rounded-xl border border-border bg-card"><summary className="cursor-pointer px-4 py-3 text-xs font-medium">Notification preferences</summary><div className="space-y-4 border-t border-border p-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-medium">Browser notifications</p><p className="mt-1 text-[11px] leading-5 text-muted-foreground">Optional alerts on this device, including when the dashboard is in the background.</p></div><Button type="button" size="sm" variant="outline" onClick={() => push.mutate()} disabled={push.isPending || browser.isPending || !supportsPush() || !preference.pushAvailable || user.isPreview}>{push.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <BellRing className="size-3.5" />}{browser.data ? "Disable on this device" : "Enable on this device"}</Button></div>
    {!supportsPush() && <p className="text-[11px] text-muted-foreground">This browser needs HTTPS and support for browser push. On iPhone or iPad, add the app to the Home Screen first.</p>}
    {!preference.pushAvailable && <p className="text-[11px] text-muted-foreground">Browser push is awaiting server configuration. In-app notifications remain available.</p>}
    <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); save.mutate(); }}>
      <fieldset><legend className="mb-2 text-xs font-medium">Send browser alerts for</legend><div className="flex flex-wrap gap-x-5 gap-y-2">{["campaigns", "credits", "accounts", "system"].map((category) => <label key={category} className="flex items-center gap-2 text-xs capitalize"><input type="checkbox" disabled={user.isPreview} checked={categories.includes(category)} onChange={(event) => setCategories((previous) => event.target.checked ? [...previous, category] : previous.filter((value) => value !== category))} className="accent-primary" />{category}</label>)}</div></fieldset>
      <div className="flex flex-wrap items-end gap-3"><label className="block space-y-2 text-xs font-medium">Low-balance alert threshold<Input type="number" min={0} max={100000000} step="0.01" required value={threshold} onChange={(event) => setThreshold(event.target.value)} disabled={user.isPreview} className="h-9 w-40 focus-visible:ring-2 focus-visible:ring-ring/20" /></label><Button type="submit" size="sm" disabled={save.isPending || user.isPreview}>{save.isPending && <Loader2 className="size-3.5 animate-spin" />}Save preferences</Button></div>
      <p className="text-[11px] text-muted-foreground">Set the threshold to 0 to turn off low-balance alerts. In-app history is kept for 90 days.</p>
    </form>
  </div></details>;
}
