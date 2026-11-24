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
  if (query.isPending || query.isError) return null;
  const href = query.data?.purchase?.whatsappChatUrl;
  if (!href) return null;
  return <div className="space-y-1">
    <Button variant="outline" nativeButton={false} render={<a href={href} target="_blank" rel="noopener noreferrer" />}>
      <MessageCircle aria-hidden="true" /> Send request on WhatsApp
    </Button>
    <p className="text-xs text-muted-foreground">Optional: give your account admin a heads-up for a quicker review. Tap Send in WhatsApp when you’re ready.</p>
  </div>;
}
