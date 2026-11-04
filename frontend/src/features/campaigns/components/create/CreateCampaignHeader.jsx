import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function CreateCampaignHeader({
  onNavigateBack,
  isPending,
}) {
  return (
    <header className="space-y-4">
      <Button type="button" variant="ghost" size="sm" onClick={onNavigateBack} disabled={isPending} className="-ml-2 gap-1.5 text-xs text-muted-foreground"><ArrowLeft className="size-3.5" /> Back to campaigns</Button>
      <div className="space-y-1.5">
        <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
          Create campaign
        </h1>
        <p className="text-xs leading-5 text-muted-foreground">
          Add your message and audience, then review your campaign before submitting.
        </p>
      </div>
    </header>
  );
}

