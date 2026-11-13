import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/hooks/useAuth";
import api from "@/api/client";
import CampaignRecipientsTable from "./CampaignRecipientsTable";
import TrackedNumbersPanel from "./TrackedNumbersPanel";

export default function CampaignRecipientReview({ campaign }) {
  const { user } = useAuth();
  const isAdmin = user?.role === "Super Admin" && !user?.isPreview;
  const [focusedPhone, setFocusedPhone] = useState("");
  const tracking = useQuery({
    queryKey: ["tracked-numbers", user?._id || user?.id, campaign._id],
    enabled: isAdmin,
    queryFn: async ({ signal }) => (await api.get(`/campaigns/${campaign._id}/tracked-numbers`, { signal })).data.data,
    staleTime: 10_000,
  });
  const trackedRows = useMemo(() => new Map((tracking.data?.rows || []).filter((row) => row.inCampaign).map((row) => [row.phoneNumber, row])), [tracking.data]);
  return <div className={isAdmin ? "@container min-w-0 border-t border-border" : "min-w-0"}><div className={isAdmin ? "grid min-w-0 grid-cols-1 items-start gap-5 @min-[900px]:grid-cols-[minmax(0,1fr)_340px]" : "min-w-0"}>
    <CampaignRecipientsTable embedded={isAdmin} campaign={campaign} trackedRows={isAdmin ? trackedRows : undefined} focusedPhone={focusedPhone} onClearFocus={() => setFocusedPhone("")} />
    {isAdmin && <TrackedNumbersPanel campaignId={campaign._id} query={tracking} onLocate={setFocusedPhone} />}
  </div></div>;
}
