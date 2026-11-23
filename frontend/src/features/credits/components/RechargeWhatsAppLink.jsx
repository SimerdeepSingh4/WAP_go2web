import { useQuery } from "@tanstack/react-query";
import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { creditsApi } from "../services/credits.api";

export default function RechargeWhatsAppLink({ purchaseId }) {
  const { user } = useAuth();
  const query = useQuery({
    queryKey: ["rechargeChat", user?._id || user?.id, purchaseId],
    queryFn: ({ signal }) => creditsApi.getPurchaseById({ id: purchaseId }, signal),
    enabled: Boolean(purchaseId),
    gcTime: 0,
  });
  if (query.isPending) return <p role="status" className="text-xs text-muted-foreground">Loading WhatsApp contact…</p>;
  if (query.isError) return <Button variant="outline" onClick={() => query.refetch()}>Retry WhatsApp contact</Button>;
  const href = query.data?.purchase?.whatsappChatUrl;
  if (!href) return <p className="text-xs text-muted-foreground">WhatsApp contact is unavailable for this request.</p>;
  return <div className="space-y-1">
    <Button variant="outline" nativeButton={false} render={<a href={href} target="_blank" rel="noopener noreferrer" />}>
      <MessageCircle aria-hidden="true" /> Send request on WhatsApp
    </Button>
    <p className="text-xs text-muted-foreground">Optional: give your account admin a heads-up for a quicker review. Tap Send in WhatsApp when you’re ready.</p>
  </div>;
}
