import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "@/components/ui/toast";
import { creditsApi } from "../services/credits.api";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { DataTable, Pager, FilterSelect, QueryState } from "@/features/dashboard/components/shared";
import { dateTime, number } from "@/lib/format";
import { FileText, Eye, Upload, AlertTriangle } from "lucide-react";
import { usePurchasesList, useApprovePurchase, useRejectPurchase, useFlagPurchase } from "../hooks/useCredits";
import PurchaseStatus from "./PurchaseStatus";
import { creditCategoryNames } from "../lib/creditTransactionDisplay";
import ProofViewerModal from "./ProofViewerModal";
import RechargeModal from "./RechargeModal";
import FixPaymentProofModal from "./FixPaymentProofModal";

export default function PurchasesTable({ scope = "all", title = "Recharge Requests", description = "Track and fulfill credit purchase requests." }) {
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [selectedPurchaseForProof, setSelectedPurchaseForProof] = useState(null);
  const [resumeQuote, setResumeQuote] = useState(null);
  const [fixPurchase, setFixPurchase] = useState(null);
  const [quickRecharge, setQuickRecharge] = useState(null);
  const [insufficientError, setInsufficientError] = useState(null);

  const isSellerRole = scope !== "my" && ["Super Admin", "Reseller"].includes(user?.role);
  const resumeId = resumeQuote?.id || resumeQuote?._id;
  const resumeQuery = useQuery({
    queryKey: ["rechargeQuote", user?._id || user?.id, resumeId],
    queryFn: ({ signal }) => creditsApi.getPurchaseById({ id: resumeId }, signal),
    enabled: Boolean(resumeId),
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const loadedQuote = resumeQuery.data?.purchase;
  const canResume = ["QUOTED", "EXPIRED"].includes(loadedQuote?.status) && !loadedQuote?.hasProof;
  const flag = useFlagPurchase(() => setSelectedPurchaseForProof(null));

  const queryParams = {
    page,
    limit: 10,
    ...(statusFilter !== "all" ? { status: statusFilter } : {}),
    ...(categoryFilter !== "all" ? { category: categoryFilter } : {}),
    ...(scope === "client" ? { scope: "seller" } : scope === "my" ? { scope: "buyer" } : {}),
  };

  const purchasesQuery = usePurchasesList(queryParams);
  const approveMutation = useApprovePurchase(
    () => {
      setSelectedPurchaseForProof(null);
      setInsufficientError(null);
    },
    (error) => {
      const errData = error.response?.data;
      const isInsufficient =
        errData?.isInsufficientBalance ||
        error.message?.includes("Not enough balance") ||
        error.message?.includes("Insufficient credits") ||
        error.message?.includes("insufficient credit");

      if (isInsufficient && user?.role === "Reseller") {
        const category = errData?.category || selectedPurchaseForProof?.category || "CAMPAIGN";
        const shortfall = errData?.shortfall || (selectedPurchaseForProof ? selectedPurchaseForProof.quantity : 5000);
        const catName = category === "NUMBER_FILTERING" ? "Number Filtering" : "Campaign";

        setInsufficientError({
          category,
          shortfall,
          required: errData?.required || selectedPurchaseForProof?.quantity,
          available: errData?.available ?? 0,
        });

        // When the proof viewer modal is open, the modal displays the inline alert
        // with the Quick Recharge button directly in view. Do not show the floating toast
        // to prevent it from overlapping the modal's quick recharge button.
        if (!selectedPurchaseForProof) {
          toast.add({
            title: "Not enough balance",
            description: `You need ${number(shortfall)} more ${catName} credits to approve this purchase request.`,
            type: "warning",
            actionProps: {
              children: "Quick Recharge",
              onClick: () => {
                setSelectedPurchaseForProof(null);
                setInsufficientError(null);
                setQuickRecharge({
                  category,
                  quantity: shortfall,
                });
              },
            },
          });
        }
      } else {
        toast.add({
          title: "Failed to approve purchase",
          description: error.message || "Failed to approve purchase",
          type: "error",
        });
      }
    }
  );
  const rejectMutation = useRejectPurchase(() => setSelectedPurchaseForProof(null));

  const purchases = purchasesQuery.data?.purchases || [];
  const pagination = purchasesQuery.data?.pagination || {};
  const viewedPurchase = purchases.find(p => selectedPurchaseForProof && p.id === selectedPurchaseForProof.id) || selectedPurchaseForProof;

  const columns = [
    {
      key: "id",
      label: "Quote / Date",
      className: "w-36",
      render: (p) => (
        <div className="space-y-0.5">
          <span className="font-mono text-xs font-semibold text-foreground">
            #{String(p.id).slice(-8)}
          </span>
          <span className="block text-[11px] text-muted-foreground">{dateTime(p.createdAt)}</span>
        </div>
      ),
    },
    {
      key: "buyer",
      label: isSellerRole ? "Buyer Account" : "Seller",
      render: (p) => {
        const target = isSellerRole ? p.buyer : p.seller;
        const isUserViewer = user?.role === "User";
        const roleLabel = isUserViewer && (target?.role === "Super Admin" || target?.role === "Reseller")
          ? "Admin"
          : (target?.role || "—");
        const nameLabel = isUserViewer && target?.role === "Super Admin"
          ? "Admin"
          : isUserViewer && target?.role === "Reseller"
          ? (target?.username?.startsWith("Admin") ? target.username : `Admin (${target?.username || "Reseller"})`)
          : (target?.username || "—");
        return (
          <div className="space-y-0.5">
            <span className="font-medium text-xs text-foreground block">{nameLabel}</span>
            <span className="text-[11px] text-muted-foreground">{roleLabel}</span>
          </div>
        );
      },
    },
    {
      key: "quantity", label: "Credits",
      render: p => <div><strong className="block tabular-nums">{number(p.quantity)}</strong>
        <span className="text-xs text-muted-foreground">{creditCategoryNames[p.category] || p.category}</span></div>,
    },
    {
      key: "amount", label: "Amount", className: "text-right",
      render: p => <span className="font-medium tabular-nums">₹{p.totalInr}</span>,
    },
    {
      key: "status", label: "Status",
      render: p => <PurchaseStatus purchase={p} />,
    },
    {
      key: "actions",
      label: "Action",
      className: "text-right",
      render: (p) => {
        const isBuyer = String(p.buyer?.id) === String(user?._id || user?.id);
        const canReview = isSellerRole && String(p.seller?.id) === String(user?._id || user?.id);

        if (p.status === "FLAGGED" && isBuyer) {
          const hasChanceLeft = (p.fixAttempts || 0) < 1;
          return (
            <div className="flex items-center justify-end gap-1.5">
              {hasChanceLeft ? (
                <Button
                  size="sm"
                  className="gap-1.5 text-xs h-7 bg-amber-600 hover:bg-amber-700 text-white font-medium shadow-none"
                  onClick={() => setFixPurchase(p)}
                >
                  <AlertTriangle className="size-3" /> Correct proof
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1 text-xs h-7"
                  onClick={() => setSelectedPurchaseForProof(p)}
                >
                  <Eye className="size-3" /> View details
                </Button>
              )}
            </div>
          );
        }

        if (["QUOTED", "EXPIRED"].includes(p.status) && isBuyer) {
          return (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 text-xs h-7"
              onClick={() => setResumeQuote(p)}
            >
              <Upload className="size-3" /> {p.status === "EXPIRED" ? "Submit late proof" : "Continue recharge"}
            </Button>
          );
        }

        if (["PENDING", "REVIEW_REQUIRED", "FLAGGED"].includes(p.status) && canReview) {
          return (
            <div className="flex items-center justify-end gap-1.5">
              <Button
                size="sm"
                variant="outline"
                className="gap-1 text-xs h-7"
                onClick={() => setSelectedPurchaseForProof(p)}
              >
                <Eye className="size-3" /> {p.status === "FLAGGED" ? "View feedback" : "Review proof"}
              </Button>
            </div>
          );
        }

        return (
          <Button
            size="sm"
            variant="ghost"
            className="text-xs h-7 text-muted-foreground"
            onClick={() => setSelectedPurchaseForProof(p)}
          >
            <FileText className="size-3" /> View details
          </Button>
        );
      },
    },
  ];

  return (
    <div className="space-y-3">
      {/* Table toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-1 border-b">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <FilterSelect
            label="Category"
            value={categoryFilter}
            onChange={(val) => {
              setCategoryFilter(val);
              setPage(1);
            }}
            options={[
              { value: "all", label: "All Categories" },
              { value: "CAMPAIGN", label: "Campaign Credits" },
              { value: "NUMBER_FILTERING", label: "Number Filtering Credits" },
            ]}
          />

          <FilterSelect
            label="Status"
            value={statusFilter}
            onChange={(val) => {
              setStatusFilter(val);
              setPage(1);
            }}
            options={[
              { value: "all", label: "All Statuses" },
              { value: "PENDING", label: "Awaiting review" },
              { value: "FLAGGED", label: "Flagged for correction" },
              { value: "APPROVED", label: "Approved / Credited" },
              ...(!isSellerRole ? [{ value: "QUOTED", label: "Awaiting payment" }] : []),
              { value: "REJECTED", label: "Rejected" },
              { value: "REVIEW_REQUIRED", label: "Manual review" },
              { value: "EXPIRED", label: "Expired" },
            ]}
          />
        </div>
      </div>

      <QueryState query={purchasesQuery}>
      <DataTable
        caption="Credit Purchases"
        rows={purchases}
        columns={columns}
        mobile={{ primary: "quantity", secondary: "id", featured: ["status", "amount"] }}
        paginated={false}
        emptyTitle="No recharge requests found"
        emptyDescription="Purchase quotes and payment submissions will appear here."
      />

      </QueryState>

      {pagination.totalPages > 1 && (
        <Pager
          page={page}
          totalPages={pagination.totalPages}
          total={pagination.total}
          onChange={(p) => setPage(p)}
          disabled={purchasesQuery.isFetching}
        />
      )}

      {/* Proof Viewer & Review Modal */}
      {selectedPurchaseForProof && (
        <ProofViewerModal
          key={[viewedPurchase.id, viewedPurchase.status, viewedPurchase.fixAttempts].join("-")}
          purchase={viewedPurchase}
          open={Boolean(selectedPurchaseForProof)}
          onOpenChange={(open) => {
            if (!open) {
              setSelectedPurchaseForProof(null);
              setInsufficientError(null);
            }
          }}
          isReviewer={isSellerRole && String(selectedPurchaseForProof.seller?.id) === String(user?._id || user?.id)}
          busy={approveMutation.isPending || rejectMutation.isPending || flag.isPending}
          onFlag={(p, reason) => flag.mutate({ id: p.id || p._id, reason })}
          onFix={String(viewedPurchase.buyer?.id) === String(user?._id || user?.id) ? setFixPurchase : undefined}
          onApprove={(p, confirmManualReview) => approveMutation.mutate({ id: p.id, confirmManualReview })}
          onReject={(p, reason) => rejectMutation.mutate({ id: p.id || p._id, reason })}
          insufficientBalance={insufficientError}
          onQuickRecharge={(info) => {
            setSelectedPurchaseForProof(null);
            setInsufficientError(null);
            setQuickRecharge({
              category: info.category,
              quantity: info.shortfall,
            });
          }}
        />
      )}

      {/* Fix Flagged Proof Modal (1 chance only) */}
      {fixPurchase && (
        <FixPaymentProofModal
          purchase={fixPurchase}
          open={Boolean(fixPurchase)}
          onOpenChange={(open) => {
            if (!open) setFixPurchase(null);
          }}
        />
      )}

      {/* Quick Recharge Modal (for insufficient balance shortfall) */}
      {quickRecharge && (
        <RechargeModal
          open={Boolean(quickRecharge)}
          onOpenChange={(open) => {
            if (!open) setQuickRecharge(null);
          }}
          initialCategory={quickRecharge.category}
          initialQuantity={quickRecharge.quantity}
        />
      )}

      {/* Resume Quote Modal */}
      {resumeQuote && !canResume && (
        <Dialog open onOpenChange={next => { if (!next) setResumeQuote(null); }}>
          <DialogContent>
            <DialogTitle>Continue recharge</DialogTitle>
            <DialogDescription>Quote #{String(resumeId).slice(-8)}</DialogDescription>
            {resumeQuery.isFetching ? <p role="status">Loading payment details…</p> : resumeQuery.isError ? <>
              <p role="alert">{resumeQuery.error.message}</p>
              <Button variant="outline" onClick={() => resumeQuery.refetch()}>Try again</Button>
            </> : loadedQuote && <>
              <PurchaseStatus purchase={loadedQuote} />
              <p className="text-sm text-muted-foreground">This order has moved past payment. Check its current status before taking another action.</p>
              <Button onClick={() => { setResumeQuote(null); void purchasesQuery.refetch(); }}>Back to purchases</Button>
            </>}
          </DialogContent>
        </Dialog>
      )}
      {resumeQuote && canResume && (
        <RechargeModal
          key={resumeId}
          open={Boolean(resumeQuote)}
          onOpenChange={(open) => {
            if (!open) setResumeQuote(null);
          }}
          activeQuote={loadedQuote}
        />
      )}
    </div>
  );
}
