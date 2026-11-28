import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ListFilter, LoaderCircle, Send } from "lucide-react";
import { creditCategoryNames } from "../lib/creditTransactionDisplay";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useCreditRates, useSetCreditRate } from "../hooks/useCredits";
import "./credit-settings.css";

function RateField({ buyerId, category, rate, purchaseRateInr, disabled, readOnly = false }) {
  const inputId = useId();
  const savedPrice = !readOnly && rate?.isDefault ? "" : String(rate?.unitPriceInr ?? "");
  const [price, setPrice] = useState(savedPrice);
  const save = useSetCreditRate();
  const trimmedPrice = price.trim();
  const hasChanges = trimmedPrice !== savedPrice;
  const canSave = Boolean(trimmedPrice && hasChanges && !disabled && !readOnly && !save.isPending);
  const Icon = category === "CAMPAIGN" ? Send : ListFilter;
  const rateHint = !rate ? "No rate set" : rate.isDefault || hasChanges
    ? `${rate.isDefault ? "Seller default" : "Saved rate"} ₹${rate.unitPriceInr} per credit`
    : null;

  return (
    <form className="credit-rate-field" onSubmit={event => {
      event.preventDefault();
      if (canSave) save.mutate({ buyerId, category, unitPriceInr: trimmedPrice });
    }}>
      <div className="min-w-0">
        <label className="credit-rate-label" htmlFor={inputId}>
          {!buyerId && <span className="credit-rate-icon"><Icon aria-hidden="true" /></span>}
          <span>{creditCategoryNames[category]}</span>
        </label>
        {purchaseRateInr !== undefined && (
          <dl className="credit-rate-purchase-price">
            <dt>Price from Super Admin</dt>
            <dd>{purchaseRateInr == null ? "Unavailable" : `₹${purchaseRateInr} per credit`}</dd>
          </dl>
        )}
      </div>
      <div className="credit-rate-controls">
        <div className="credit-rate-input">
          <span aria-hidden="true">₹</span>
          <Input
            id={inputId}
            type="text"
            inputMode="decimal"
            required
            value={price}
            placeholder="0.00"
            aria-describedby={rateHint ? `${inputId}-hint ${inputId}-unit` : `${inputId}-unit`}
            onChange={event => setPrice(event.target.value)}
            disabled={disabled || readOnly || save.isPending}
          />
          <span id={`${inputId}-unit`}>per credit<span className="sr-only"> in INR</span></span>
        </div>
        {!readOnly && (
          <Button type="submit" variant="outline" disabled={!canSave}>
            {save.isPending ? "Saving…" : "Save rate"}
          </Button>
        )}
      </div>
      {rateHint && <p className="credit-rate-hint" id={`${inputId}-hint`}>{rateHint}</p>}
    </form>
  );
}

export function PurchaseRateEditor({ buyerId, disabled, showPurchaseRates = false }) {
  const query = useCreditRates({ buyerId: buyerId || "default" });
  if (!query.data) return query.isError ? (
    <div className="credit-settings-load">
      <p role="alert">{query.error.message}</p>
      <Button type="button" variant="outline" onClick={() => query.refetch()}>Retry</Button>
    </div>
  ) : (
    <p className="credit-settings-load" role="status">
      <LoaderCircle className="motion-safe:animate-spin" aria-hidden="true" /> Loading credit rates…
    </p>
  );
  const readOnly = Boolean(disabled || (buyerId && query.data.canEdit === false));
  const managedSeller = buyerId && query.data.canEdit === false ? query.data.seller : null;
  return <div className="credit-rates-list">
    {buyerId && query.data.canEdit === false && (
      <p className="text-xs text-muted-foreground rounded-lg border border-border bg-muted/40 px-3 py-2">
        {managedSeller
          ? `Managed by ${managedSeller.username} (${managedSeller.role}). View-only access.`
          : "No seller is assigned to this account. View-only access."}
      </p>
    )}
    {Object.keys(creditCategoryNames).map(category => {
      const saved = query.data.rates?.find(rate => rate.category === category);
      const rate = buyerId ? query.data.purchaseRates?.[category] : saved && {
        unitPriceInr: saved.unitPriceInr?.$numberDecimal ?? String(saved.unitPriceInr),
      };
      const purchaseRateInr = showPurchaseRates ? query.data.purchaseRates?.[category]?.unitPriceInr ?? null : undefined;
      return <RateField key={`${buyerId ?? "default"}:${category}:${rate?.unitPriceInr ?? ""}:${Boolean(rate?.isDefault)}`}
        buyerId={buyerId} category={category} rate={rate} purchaseRateInr={purchaseRateInr} disabled={disabled} readOnly={readOnly} />;
    })}
  </div>;
}

export default function BuyerPurchaseRatesDialog({ account, onClose, disabled }) {
  return (
    <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Purchase rates for {account.username}</DialogTitle>
          <DialogDescription>Set the INR price for each credit category. The seller default applies where a custom price is unset.</DialogDescription>
        </DialogHeader>
        <PurchaseRateEditor buyerId={account._id} disabled={disabled} />
      </DialogContent>
    </Dialog>
  );
}
