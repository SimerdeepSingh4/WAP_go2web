import { useState } from "react";
import { useParams, Link, Navigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, AlertCircle } from "lucide-react";
import api from "@/api/client";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";

import CampaignDetailHeader from "../components/detail/CampaignDetailHeader";
import CampaignDetailMetrics from "../components/detail/CampaignDetailMetrics";
import CampaignMessagePreview from "../components/detail/CampaignMessagePreview";
import CampaignAttachmentsView from "../components/detail/CampaignAttachmentsView";
import ImageLightbox from "../components/detail/ImageLightbox";
import { messageTextFromHtml } from "../lib/messageText";

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    toast.add({ title: "Couldn't copy. Check clipboard permissions.", type: "error" });
    return false;
  }
}

export default function CampaignDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const [copiedText, setCopiedText] = useState(false);
  const [previewImage, setPreviewImage] = useState(null);

  const isAdmin = user?.role === "Super Admin";

  const base =
    isAdmin ? "/admin" : user?.role === "Reseller" ? "/reseller" : "/user";

  const { data: campaign, isLoading, isError, error } = useQuery({
    queryKey: ["campaign-detail", id],
    queryFn: async () => {
      const res = await api.get(`/campaigns/${id}`);
      return res.data?.data;
    },
    staleTime: 10_000,
    enabled: isAdmin,
  });

  const copyMessage = async () => {
    if (!campaign?.messageBody) return;
    if (await copyText(messageTextFromHtml(campaign.messageBody))) {
      setCopiedText(true);
      toast.add({ title: "Message copied", type: "success" });
      setTimeout(() => setCopiedText(false), 2000);
    }
  };

  const downloadMedia = async (url, filename) => {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objUrl;
      a.download = filename || "attachment";
      a.click();
      URL.revokeObjectURL(objUrl);
    } catch {
      window.open(url, "_blank");
    }
  };

  /* ---------- Loading / error ---------- */

  if (user && !isAdmin) {
    return <Navigate to={`${base}/campaigns/${id}/report`} replace />;
  }

  if (isLoading) {
    return (
      <div className="flex min-w-0 flex-col gap-5">
        <div className="space-y-2">
          <div className="h-4 w-32 bg-muted animate-pulse rounded-md" />
          <div className="h-8 w-80 bg-muted animate-pulse rounded-md" />
        </div>
        <div className="portal-metrics">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="portal-card h-24 bg-muted/40 animate-pulse" />
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="h-64 bg-muted/40 animate-pulse rounded-xl" />
          <div className="h-64 bg-muted/40 animate-pulse rounded-xl" />
        </div>
        <div className="h-96 bg-muted/40 animate-pulse rounded-xl" />
      </div>
    );
  }

  if (isError || !campaign) {
    return (
      <div className="portal-overview py-16 text-center">
        <div className="mx-auto mb-4 size-12 rounded-full bg-muted flex items-center justify-center">
          <AlertCircle className="size-6 text-muted-foreground" />
        </div>
        <h2 className="text-lg font-semibold text-foreground">Campaign not found</h2>
        <p className="text-sm text-muted-foreground mt-1 mb-5 max-w-sm mx-auto">
          {error?.message || "It may have been deleted, or you may not have access to it."}
        </p>
        <Button nativeButton={false} render={<Link to={`${base}/campaigns`} />}>
          <ArrowLeft className="size-4 mr-2" />
          Back to campaigns
        </Button>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-5">
      {/* Header */}
      <CampaignDetailHeader campaign={campaign} base={base} id={id} />

      {/* KPIs */}
      <CampaignDetailMetrics campaign={campaign} />

      {/* Main layout: Message & Attachments in same row, Category Cards below */}
      <div className="space-y-5">
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <CampaignMessagePreview
            campaign={campaign}
            copiedText={copiedText}
            onCopyMessage={copyMessage}
          />
          <CampaignAttachmentsView
            campaign={campaign}
            onPreviewImage={setPreviewImage}
            onDownloadMedia={downloadMedia}
          />
        </div>

      </div>

      {/* Lightbox */}
      <ImageLightbox
        previewImage={previewImage}
        onClose={() => setPreviewImage(null)}
        onDownload={downloadMedia}
      />
    </div>
  );
}
