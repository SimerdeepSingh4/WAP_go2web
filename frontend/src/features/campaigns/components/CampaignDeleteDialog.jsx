import { Link } from "react-router";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

export default function CampaignDeleteDialog({ campaign, mutation, open = true, onClose }) {
  const { user } = useAuth();
  const needsReport = !campaign.publishedSpreadsheet?.publishedAt || (mutation.variables === campaign._id && mutation.error?.response?.data?.code === "CAMPAIGN_REPORT_REQUIRED");
  return <AlertDialog open={open} onOpenChange={(next) => { if (!next && !mutation.isPending) onClose(); }}>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{needsReport ? "Publish a report before deleting" : `Delete campaign "${campaign.campaignTitle}"?`}</AlertDialogTitle>
        <AlertDialogDescription>{needsReport
          ? "This campaign does not have a published report. A Super Admin must create and publish the report first so its charges and refunds are settled correctly. Saving a draft is not enough."
          : "This will permanently remove the campaign and its report. Credit charges, refunds, and transaction history will be kept. This action cannot be undone."}</AlertDialogDescription>
      </AlertDialogHeader>
      {mutation.error && !needsReport && <p role="alert" className="text-sm text-destructive">{mutation.error.message}</p>}
      <AlertDialogFooter>
        <AlertDialogCancel disabled={mutation.isPending}>{needsReport ? "Close" : "Cancel"}</AlertDialogCancel>
        {needsReport ? user?.role === "Super Admin" && <Button nativeButton={false} render={<Link to={`/admin/campaigns/${campaign._id}/report/create`} />}>Create report</Button> : <AlertDialogAction variant="destructive" disabled={mutation.isPending} onClick={(event) => { event.preventDefault(); mutation.mutate(campaign._id); }}>{mutation.isPending ? "Deleting..." : "Delete campaign"}</AlertDialogAction>}
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>;
}
