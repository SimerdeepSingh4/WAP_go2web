import { Badge } from "@/components/ui/badge";
import { FILTERING_STATUS_LABELS } from "../../../../../shared/numberFiltering.js";

const tones = { SUBMITTED: "warning", IN_REVIEW: "info", PUBLISHED: "success" };

export default function FilteringStatusBadge({ status }) {
  return <Badge variant="outline" className="portal-status font-normal" data-tone={tones[status] || "neutral"}>{FILTERING_STATUS_LABELS[status] || status}</Badge>;
}
