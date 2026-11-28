import { useEffect, useState } from "react";
import { ExternalLink, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { creditsApi } from "../services/credits.api";

export default function PurchaseReceipt({ purchase, onLoaded }) {
  const [receipt, setReceipt] = useState(null);
  const hasProof = Boolean(purchase?.hasProof);
  const id = purchase?.id ?? purchase?._id;
  useEffect(() => {
    onLoaded?.(false);
    if (!hasProof || !id) return;
    const controller = new AbortController();
    let url;
    creditsApi.getProof(id, controller.signal).then(file => {
      if (controller.signal.aborted) return;
      url = URL.createObjectURL(file);
      onLoaded?.(true);
      setReceipt({ id, url, isImage: file.type.startsWith("image/") });
    }).catch((err) => {
      if (!controller.signal.aborted) {
        setReceipt({ id, error: true, notFound: err?.response?.status === 404 });
      }
    });
    return () => { controller.abort(); if (url) URL.revokeObjectURL(url); };
  }, [hasProof, id, onLoaded]);

  const proof = hasProof && receipt?.id === id ? receipt : null;
  return (
    <section className="payment-proof-document" aria-label="Receipt">
      <div className="payment-proof-document-header">
        <h3>Receipt</h3>
        {proof?.url && (
          <Button
            variant="ghost"
            size="sm"
            readOnlySafe
            nativeButton={false}
            render={<a href={proof.url} target="_blank" rel="noopener noreferrer" />}
          >
            {proof.isImage ? "Open original" : "Open PDF"} <ExternalLink aria-hidden="true" />
          </Button>
        )}
      </div>
      <div className="payment-proof-preview">
        {!hasProof ? (
          <p>No payment proof submitted.</p>
        ) : proof?.error ? (
          <p role="alert">{proof.notFound ? "Payment proof file was not found on this server." : "The payment proof could not be loaded."}</p>
        ) : !proof ? (
          <p role="status"><Loader2 className="motion-safe:animate-spin" aria-hidden="true" /> Loading payment proof</p>
        ) : proof.isImage ? (
          <img src={proof.url} alt="Submitted payment receipt" decoding="async" />
        ) : (
          <p><FileText aria-hidden="true" /> PDF receipt</p>
        )}
      </div>
    </section>
  );
}
