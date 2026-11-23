import RecordReference from "@/components/ui/RecordReference";

export default function FilteringReference({ request, id: explicitId, compact = true, to }) {
  const raw = explicitId || (typeof request === "string" ? request : request?.filteringId || request?.id || request?._id || "");
  const id = raw.toUpperCase().startsWith("FLT-")
    ? raw.toUpperCase()
    : raw
    ? `FLT-${String(raw).toUpperCase()}`
    : "";
  return <RecordReference id={id} prefix="FLT" label="Filtering ID" compact={compact} to={to} />;
}
