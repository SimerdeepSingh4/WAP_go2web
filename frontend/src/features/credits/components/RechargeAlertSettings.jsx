import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MessageCircle } from "lucide-react";
import api from "@/api/client";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";

const endpoint = "/credits/recharge-alert-settings";

export default function RechargeAlertSettings() {
  const { user } = useAuth();
  const accountId = user?._id || user?.id;
  return <AlertForm key={accountId} accountId={accountId} readOnly={user?.isPreview} />;
}

function AlertForm({ accountId, readOnly }) {
  const client = useQueryClient();
  const queryKey = ["rechargeAlertSettings", accountId];
  const settings = useQuery({
    queryKey, enabled: Boolean(accountId),
    queryFn: async ({ signal }) => (await api.get(endpoint, { signal })).data,
  });
  const [draft, setDraft] = useState(null);
  const save = useMutation({
    mutationFn: async number => (await api.put(endpoint, { number })).data,
    onSuccess: async data => {
      await client.cancelQueries({ queryKey, exact: true });
      client.setQueryData(queryKey, data);
      setDraft(null);
      toast.add({ title: data.number ? "WhatsApp number saved" : "WhatsApp alerts turned off", type: "success" });
    },
  });
  const number = draft ?? settings.data?.number ?? "";
  return <section className="credit-settings-panel" aria-labelledby="whatsapp-alert-title">
    <header className="credit-settings-heading">
      <span className="credit-settings-icon"><MessageCircle aria-hidden="true" /></span>
      <div><h2 id="whatsapp-alert-title">WhatsApp recharge alerts</h2><p>Receive a message when a buyer submits or corrects payment proof for your review.</p></div>
    </header>
    <form className="credit-alert-form" onSubmit={event => {
      event.preventDefault();
      if (settings.data && !readOnly && !save.isPending) save.mutate(number.trim());
    }}>
      {settings.isError ? <div role="alert">{settings.error.message} <Button type="button" variant="outline" onClick={() => settings.refetch()}>Retry</Button></div> :
        <fieldset disabled={!settings.data || readOnly || save.isPending} className="credit-alert-fields">
          <label htmlFor="recharge-whatsapp-number">WhatsApp number</label>
          <div className="credit-alert-controls">
          <Input id="recharge-whatsapp-number" type="tel" autoComplete="tel" placeholder="+919876543210"
            pattern={"\\+[1-9][0-9]{6,14}"} aria-describedby="recharge-whatsapp-help" value={number}
            onChange={event => { setDraft(event.target.value); save.reset(); }} />
          <Button type="submit" disabled={number === settings.data?.number}>{save.isPending ? "Saving…" : "Save number"}</Button>
          </div>
          <p id="recharge-whatsapp-help" className="text-xs text-muted-foreground">Buyers can message this number from WhatsApp after submitting proof. Include + and the country code. Clear and save to disable contact and alerts.</p>
          {settings.data?.senderConfigured === false && <p role="status" className="text-sm font-medium">
            Automatic alerts need a configured platform sender. Buyers can still message your saved number from their own WhatsApp.
          </p>}
          {save.isError && <p role="alert">{save.error.message}</p>}
        </fieldset>}
    </form>
  </section>;
}
