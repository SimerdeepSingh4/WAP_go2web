import { useLocation, useSearchParams, Link } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, ArrowLeft } from "lucide-react";
import api from "@/api/client";
import "./breadcrumbs.css";

/**
 * Hook to retrieve campaign title by ID from React Query cache or API.
 */
function useCampaignTitle(id) {
  const queryClient = useQueryClient();

  const cached =
    queryClient.getQueryData(["campaign-detail", id]) ||
    queryClient.getQueryData(["campaign-report", id]);

  const { data } = useQuery({
    queryKey: ["campaign-detail", id],
    queryFn: async () => {
      const res = await api.get(`/campaigns/${id}`);
      return res.data?.data;
    },
    enabled: Boolean(id && id !== "create" && id !== "new" && !cached?.campaignTitle),
    staleTime: 60_000,
    initialData: cached,
  });

  const campaign = data || cached;
  if (campaign?.campaignTitle) return campaign.campaignTitle;
  if (!id) return "";
  return `CMP-${id.slice(-6).toUpperCase()}`;
}

/**
 * Hook to retrieve account username for reconciliation review.
 */
function useReconciliationUsername(accountId) {
  const queryClient = useQueryClient();
  const cached = queryClient.getQueryData(["reconciliation-account-label", accountId]);

  const { data } = useQuery({
    queryKey: ["reconciliation-account-label", accountId],
    queryFn: async () => {
      const res = await api.get(`/users/${accountId}`);
      return res.data?.user?.username || null;
    },
    enabled: Boolean(accountId && /^[a-f\d]{24}$/i.test(accountId) && !cached),
    staleTime: 60_000,
    initialData: cached,
  });

  const username = data || cached;
  return username ? `@${username}` : null;
}

export default function Breadcrumbs({ base }) {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const pathname = location.pathname;

  // Extract ID if on a campaign subroute
  const campaignSubMatch = pathname.match(new RegExp(`^${base}/campaigns/([^/]+)`));
  const rawCampaignId = campaignSubMatch ? campaignSubMatch[1] : null;
  const isSpecialCampaignAction = rawCampaignId === "create" || rawCampaignId === "new";
  const campaignId = isSpecialCampaignAction ? null : rawCampaignId;

  const campaignTitle = useCampaignTitle(campaignId);

  const reconciliationAccountId = pathname === `${base}/reconciliation` ? searchParams.get("account") : null;
  const reconciliationUsername = useReconciliationUsername(reconciliationAccountId);

  // 1. Root dashboard: No breadcrumbs (uncluttered)
  if (pathname === base || pathname === `${base}/` || pathname === "/") {
    return null;
  }

  let items = null;
  let parentPath = null;
  let parentLabel = null;

  // 2. Campaign Create routes: /:role/campaigns/create or /new
  if (pathname === `${base}/campaigns/create` || pathname === `${base}/campaigns/new`) {
    items = [
      { label: "Campaigns", to: `${base}/campaigns` },
      { label: "Create Campaign", isCurrent: true },
    ];
    parentPath = `${base}/campaigns`;
    parentLabel = "Campaigns";
  }
  // 3. Campaign Report Create (Admin only): /admin/campaigns/:id/report/create
  else if (pathname.startsWith(`${base}/campaigns/`) && pathname.endsWith("/report/create")) {
    items = [
      { label: "Campaigns", to: `${base}/campaigns` },
      { label: campaignTitle, to: `${base}/campaigns/${campaignId}` },
      { label: "Create Report", isCurrent: true },
    ];
    parentPath = `${base}/campaigns/${campaignId}`;
    parentLabel = campaignTitle || "Campaign";
  }
  // 4. Campaign Delivery Report: /:role/campaigns/:id/report
  else if (pathname.startsWith(`${base}/campaigns/`) && pathname.endsWith("/report")) {
    items = [
      { label: "Campaigns", to: `${base}/campaigns` },
      { label: campaignTitle, to: `${base}/campaigns/${campaignId}` },
      { label: "Delivery Report", isCurrent: true },
    ];
    parentPath = `${base}/campaigns/${campaignId}`;
    parentLabel = campaignTitle || "Campaign";
  }
  // 5. Campaign Detail: /:role/campaigns/:id
  else if (pathname.startsWith(`${base}/campaigns/`) && campaignId) {
    items = [
      { label: "Campaigns", to: `${base}/campaigns` },
      { label: campaignTitle, isCurrent: true },
    ];
    parentPath = `${base}/campaigns`;
    parentLabel = "Campaigns";
  }
  // 6. Reconciliation with Account Selected: /admin/reconciliation?account=...
  else if (pathname === `${base}/reconciliation` && (searchParams.has("account") || searchParams.get("action") === "recover")) {
    const accLabel = reconciliationUsername || "Account Evidence";
    items = [
      { label: "Reconciliation", to: `${base}/reconciliation` },
      { label: accLabel, isCurrent: true },
    ];
    parentPath = `${base}/reconciliation`;
    parentLabel = "Reconciliation";
  }
  // 7. Generic deep nested path (depth >= 2 below base)
  else if (pathname.startsWith(`${base}/`)) {
    const subpath = pathname.slice(base.length).replace(/^\//, "");
    const segments = subpath.split("/").filter(Boolean);

    // Only render on deep pages (depth >= 2) to avoid cluttering primary list pages
    if (segments.length >= 2) {
      items = segments.map((seg, idx) => {
        const accumulated = base + "/" + segments.slice(0, idx + 1).join("/");
        const isLast = idx === segments.length - 1;
        const formatted = seg
          .split(/[-_]/)
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(" ");

        return {
          label: formatted,
          to: isLast ? null : accumulated,
          isCurrent: isLast,
        };
      });

      if (items.length > 1) {
        parentPath = items[items.length - 2]?.to || base;
        parentLabel = items[items.length - 2]?.label || "Parent";
      }
    }
  }

  // If this route doesn't require breadcrumbs, return null cleanly
  if (!items || items.length < 2) {
    return null;
  }

  return (
    <nav aria-label="Breadcrumb" className="portal-breadcrumb-bar">
      <div className="portal-breadcrumb-inner">
        {parentPath && (
          <Link
            to={parentPath}
            className="portal-breadcrumb-back"
            aria-label={`Back to ${parentLabel || "previous page"}`}
            title={`Back to ${parentLabel || "previous page"}`}
          >
            <ArrowLeft className="size-3.5" aria-hidden="true" />
          </Link>
        )}
        <ol className="portal-breadcrumb-list">
          {items.map((item, index) => {
            const isLast = index === items.length - 1 || item.isCurrent;
            return (
              <li key={index} className="portal-breadcrumb-item">
                {index > 0 && (
                  <ChevronRight
                    className="portal-breadcrumb-separator size-3.5"
                    aria-hidden="true"
                  />
                )}
                {isLast || !item.to ? (
                  <span
                    className="portal-breadcrumb-current"
                    aria-current={isLast ? "page" : undefined}
                    title={typeof item.label === "string" ? item.label : undefined}
                  >
                    {item.label}
                  </span>
                ) : (
                  <Link
                    to={item.to}
                    className="portal-breadcrumb-link"
                    title={typeof item.label === "string" ? item.label : undefined}
                  >
                    {item.label}
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </nav>
  );
}
