import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { ChevronDown, HelpCircle, MessageCircle } from "lucide-react";
import { supportApi } from "@/features/support/services/support.api.js";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export default function HelpMenu({ base, user, hasTour, startTour }) {
  const accountId = user?.id || user?._id;
  const activity = useQuery({
    queryKey: ["support", accountId, "activity"],
    queryFn: ({ signal }) => supportApi.listConversations({ status: "ongoing", limit: 1 }, signal),
    enabled: Boolean(accountId),
    staleTime: 15000,
    refetchInterval: 30000,
  });
  const hasActiveChat = activity.data?.total > 0;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="outline" size="sm" id="tour-help-button" className="relative h-8 gap-1.5 text-xs font-medium" />}
        aria-label={hasActiveChat ? "Help, active support chat" : "Help"}
      >
        <HelpCircle className="size-3.5 text-muted-foreground" aria-hidden="true" />
        <span className="hidden sm:inline">Help</span>
        <ChevronDown className="size-3 text-muted-foreground" aria-hidden="true" />
        {hasActiveChat && <span aria-hidden="true" className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full border-2 border-background bg-red-500" />}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52 p-1.5">
        <DropdownMenuItem render={<Link to={`${base}/support`} />} className="gap-2 px-2 py-2.5 text-xs">
          <MessageCircle className="size-4 text-muted-foreground" aria-hidden="true" />
          <span className="flex-1">Support</span>
          {hasActiveChat && <span className="inline-flex items-center gap-1.5 text-[10px] text-muted-foreground"><span aria-hidden="true" className="size-1.5 rounded-full bg-red-500" />Active</span>}
        </DropdownMenuItem>
        {hasTour && <DropdownMenuItem onClick={() => startTour(true)} className="gap-2 px-2 py-2.5 text-xs">
          <HelpCircle className="size-4 text-muted-foreground" aria-hidden="true" />
          Take a tour
        </DropdownMenuItem>}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
