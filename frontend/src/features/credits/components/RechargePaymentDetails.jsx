import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Copy, Download, Landmark, LoaderCircle, QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";

function PaymentDetail({ label, value, copy }) {
  if (!value) return null;
  async function copyValue() {
    try {
      await navigator.clipboard.writeText(value);
      toast.add({ title: label + " copied", type: "info" });
    } catch {
      toast.add({ title: "Select the value to copy it manually", type: "info" });
    }
  }
  return <div className="flex min-w-0 items-center justify-between gap-2 border-b py-2 last:border-0">
    <div className="min-w-0"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="select-all break-all text-sm font-medium">{value}</dd></div>
    {copy && <Button type="button" size="icon-sm" variant="ghost" aria-label={"Copy " + label} onClick={copyValue}><Copy /></Button>}
  </div>;
}

export default function RechargePaymentDetails({ quote }) {
  const { upiId, bankName, accountName, accountNumber, ifscCode, notes } = quote.paymentInstructions || {};
  const hasBank = Boolean(bankName || accountNumber || ifscCode);
  const [method, setMethod] = useState(upiId ? "upi" : "bank");
  const [qr, setQr] = useState(null);
  const id = String(quote.id || quote._id);
  const total = Number(quote.totalInr ?? quote.totalPaisa / 100).toFixed(2);
  const payee = accountName || quote.seller?.username || "Account manager";
  const uri = upiId ? "upi://pay?" + new URLSearchParams({ pa: upiId, pn: payee, am: total, cu: "INR", tr: id, tn: "Recharge #" + id.slice(-8) }) : "";
  useEffect(() => {
    if (!uri) return;
    let active = true;
    QRCode.toDataURL(uri, { width: 320, margin: 4, errorCorrectionLevel: "M" }).then(url => {
      if (active) setQr(url);
    }).catch(() => { if (active) setQr(""); });
    return () => { active = false; };
  }, [uri]);
  return <section className="space-y-3" aria-label="Payment instructions">
    {upiId && hasBank ? <div role="group" aria-label="Payment method" className="recharge-methods">
      <button type="button" aria-pressed={method === "upi"} onClick={() => setMethod("upi")}><QrCode /> UPI</button>
      <button type="button" aria-pressed={method === "bank"} onClick={() => setMethod("bank")}><Landmark /> Bank transfer</button>
    </div> : (upiId || hasBank) && <h3 className="text-sm font-semibold">{upiId ? "Pay with UPI" : "Bank transfer"}</h3>}
    {method === "upi" && uri ? <div className="recharge-upi">
      <div className="grid size-36 shrink-0 place-items-center overflow-hidden rounded-lg border bg-white">
        {qr ? <img src={qr} width="144" height="144" alt="Scan to pay the quoted amount by UPI" /> : qr === null ? <LoaderCircle className="size-5 animate-spin text-gray-600" aria-label="Generating QR code" /> : <span className="p-3 text-center text-xs text-gray-700">QR unavailable. Use the UPI ID.</span>}
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        <dl><PaymentDetail label="UPI ID" value={upiId} copy /><PaymentDetail label="Payee" value={payee} /></dl>
        <div className="flex flex-wrap items-center gap-3">
          <a href={uri} className="text-sm font-semibold underline underline-offset-4 sm:hidden">Open UPI app</a>
          {qr && <a href={qr} download={"UPI-QR-" + id.slice(-8) + ".png"} className="inline-flex items-center gap-1.5 text-xs font-medium underline underline-offset-4"><Download className="size-3.5" /> Save QR</a>}
        </div>
      </div>
    </div> : hasBank ? <dl className="rounded-xl border bg-muted/20 px-3">
      <PaymentDetail label="Account holder" value={accountName} /><PaymentDetail label="Bank" value={bankName} />
      <PaymentDetail label="Account number" value={accountNumber} copy /><PaymentDetail label="IFSC" value={ifscCode} copy />
    </dl> : !notes && <p className="recharge-rate-status">Contact your account manager for payment details before transferring funds.</p>}
    {notes && <p className="whitespace-pre-wrap break-words rounded-lg bg-muted/40 px-3 py-2 text-sm">{notes}</p>}
  </section>;
}
