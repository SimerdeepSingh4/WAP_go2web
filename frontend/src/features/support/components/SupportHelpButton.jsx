import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { HelpCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { toast } from "@/components/ui/toast";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { supportApi } from "@/features/support/services/support.api.js";
import { supportContext } from "../lib/references";
import "./context-help.css";

export default function SupportHelpButton({ campaign, transaction, area = "your account", menuItem = false, inline = false, label = "Help", className = "" }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const client = useQueryClient();
  const context = supportContext({ campaign, transaction, area });
  const opening = useMutation({
    mutationFn: () => supportApi.getOrCreateConversation(context.subject),
    onSuccess: response => {
      void client.invalidateQueries({ queryKey: ["support", user?.id || user?._id] });
      navigate(`/user/support?${new URLSearchParams({ conversation: response.data._id })}`, { state: { supportDraft: context } });
    },
    onError: error => toast.add({ title: "Couldn’t open support", description: error.message, type: "error" }),
  });
  if (user?.role !== "User") return null;
  const disabled = user.isPreview || opening.isPending;
  const icon = opening.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <HelpCircle className="size-4" aria-hidden="true" />;
  const description = campaign ? `Get help with campaign ${campaign.campaignTitle || context.references[0]?.value}` : transaction ? `Get help with transaction ${context.references.at(-1)?.value}` : `Get help with ${area.toLowerCase()}`;
  if (menuItem) return <DropdownMenuItem disabled={disabled} onClick={() => opening.mutate()} aria-label={description} className={`gap-2 ${className}`}>{icon}{opening.isPending ? "Opening support…" : label}</DropdownMenuItem>;
  return <Button type="button" variant={inline ? "link" : "outline"} size="sm" disabled={disabled} onClick={() => opening.mutate()} aria-label={description} className={`gap-1.5 text-xs ${inline ? "support-context-link" : ""} ${className}`} data-support-help>{icon}{opening.isPending ? "Opening…" : label}</Button>;
}
