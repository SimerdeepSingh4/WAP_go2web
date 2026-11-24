import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/features/dashboard/components/shared";
import { IndianRupee, Landmark, LoaderCircle, Save, Smartphone } from "lucide-react";
import { usePaymentInstructions, useUpdatePaymentInstructions } from "../hooks/useCredits";
import { PurchaseRateEditor } from "./PurchaseRateEditor";
import RechargeAlertSettings from "./RechargeAlertSettings";
import "./credit-settings.css";

const bankFields = [
  { key: "bankName", id: "bank-name", label: "Bank name", placeholder: "e.g. HDFC Bank" },
  { key: "accountName", id: "account-name", label: "Account holder name", placeholder: "Name registered with the bank" },
  { key: "accountNumber", id: "account-number", label: "Account number", placeholder: "e.g. 50100234567890", inputMode: "numeric" },
  { key: "ifscCode", id: "ifsc-code", label: "IFSC code", placeholder: "e.g. HDFC0001234", autoCapitalize: "characters" },
];

export default function RateSettingsCard({ showPurchaseRates = false }) {
  const instructionsQuery = usePaymentInstructions();
  const [draft, setDraft] = useState({});
  const saveInstructions = useUpdatePaymentInstructions(() => setDraft({}));
  const saved = instructionsQuery.data?.paymentInstructions;
  const instructions = { ...saved, ...draft };
  const hasChanges = Object.entries(draft).some(([field, value]) => value.trim() !== (saved?.[field] || "").trim());
  const savedBankFields = bankFields.filter(({ key }) => saved?.[key]?.trim()).length;
  const bankReady = savedBankFields === bankFields.length;
  const upiSaved = Boolean(saved?.upiId?.trim());

  function update(field, value) {
    setDraft(previous => ({ ...previous, [field]: value }));
  }

  function handleSaveInstructions(event) {
    event.preventDefault();
    if (!instructionsQuery.data || !hasChanges || saveInstructions.isPending) return;
    saveInstructions.mutate({
      bankName: (instructions.bankName || "").trim(),
      accountNumber: (instructions.accountNumber || "").trim(),
      accountName: (instructions.accountName || "").trim(),
      ifscCode: (instructions.ifscCode || "").trim(),
      upiId: (instructions.upiId || "").trim(),
      qrCodeUrl: (instructions.qrCodeUrl || "").trim(),
      notes: (instructions.notes || "").trim(),
    });
  }

  return (
    <div className="credit-settings">
      <div className="credit-settings-layout">
        <RechargeAlertSettings />
        <section className="credit-settings-panel" aria-labelledby="selling-rates-title">
          <header className="credit-settings-heading">
            <span className="credit-settings-icon"><IndianRupee aria-hidden="true" /></span>
            <div>
              <h2 id="selling-rates-title">Selling rates</h2>
              <p>Default prices you charge buyers without a custom rate.</p>
            </div>
          </header>
          <div className="credit-settings-rates">
            <PurchaseRateEditor showPurchaseRates={showPurchaseRates} />
          </div>
        </section>

        <section className="credit-settings-panel" aria-labelledby="payment-details-title">
          <header className="credit-settings-heading">
            <span className="credit-settings-icon"><Landmark aria-hidden="true" /></span>
            <div>
              <h2 id="payment-details-title">Payment details</h2>
              <p>Buyers see these details on their recharge quotes.</p>
            </div>
          </header>

          {instructionsQuery.data ? (
            <form onSubmit={handleSaveInstructions} aria-busy={saveInstructions.isPending}>
              <div className="credit-settings-payment-body">
                <fieldset className="credit-settings-method" aria-labelledby="bank-transfer-title" disabled={saveInstructions.isPending}>
                  <div className="credit-settings-method-heading">
                    <h3 id="bank-transfer-title"><Landmark aria-hidden="true" /> Bank transfer</h3>
                    <span className="credit-settings-method-status" data-status={bankReady ? "saved" : savedBankFields ? "partial" : undefined}>
                      {bankReady ? "Details saved" : savedBankFields ? "Incomplete" : "Not set up"}
                    </span>
                  </div>
                  <div className="credit-settings-bank-fields">
                    {bankFields.map(({ key, id, label, ...inputProps }) => (
                      <Field key={key} id={id} label={label}>
                        <Input
                          id={id}
                          value={instructions[key] || ""}
                          onChange={event => update(key, event.target.value)}
                          autoComplete="off"
                          {...inputProps}
                        />
                      </Field>
                    ))}
                  </div>
                </fieldset>

                <div className="credit-settings-other-fields">
                  <fieldset className="credit-settings-method" aria-labelledby="upi-title" disabled={saveInstructions.isPending}>
                    <div className="credit-settings-method-heading">
                      <h3 id="upi-title"><Smartphone aria-hidden="true" /> UPI</h3>
                      <span className="credit-settings-method-status" data-status={upiSaved ? "saved" : undefined}>
                        {upiSaved ? "Details saved" : "Not set up"}
                      </span>
                    </div>
                    <Field id="upi-id" label="UPI ID (VPA)">
                      <Input
                        id="upi-id"
                        placeholder="e.g. payments@okhdfcbank"
                        value={instructions.upiId || ""}
                        onChange={event => update("upiId", event.target.value)}
                        autoComplete="off"
                        autoCapitalize="none"
                        spellCheck={false}
                      />
                    </Field>
                  </fieldset>
                  <Field id="notes" label="Payment notes (optional)">
                    <Textarea
                      id="notes"
                      rows={2}
                      placeholder="e.g. Include your username in the transfer remark."
                      value={instructions.notes || ""}
                      onChange={event => update("notes", event.target.value)}
                      disabled={saveInstructions.isPending}
                    />
                  </Field>
                </div>
              </div>

              <div className="credit-settings-save">
                <p role="status">
                  {hasChanges ? "Unsaved changes" : saveInstructions.isSuccess ? "Payment details saved" : "No unsaved changes"}
                </p>
                {hasChanges && <Button type="button" variant="ghost" disabled={saveInstructions.isPending} onClick={() => setDraft({})}>Discard changes</Button>}
                <Button type="submit" disabled={!hasChanges || saveInstructions.isPending}>
                  {saveInstructions.isPending
                    ? <LoaderCircle className="motion-safe:animate-spin" aria-hidden="true" />
                    : <Save aria-hidden="true" />}
                  {saveInstructions.isPending ? "Saving…" : "Save payment details"}
                </Button>
              </div>
            </form>
          ) : (
            <div className="credit-settings-payment-body">
              {instructionsQuery.isError ? (
                <div className="credit-settings-load">
                  <p role="alert">{instructionsQuery.error.message}</p>
                  <Button type="button" variant="outline" onClick={() => instructionsQuery.refetch()}>Retry</Button>
                </div>
              ) : (
                <p className="credit-settings-load" role="status">
                  <LoaderCircle className="motion-safe:animate-spin" aria-hidden="true" /> Loading payment details…
                </p>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
