import { useState, useMemo, useRef } from "react";
import { useNavigate, useLocation, Link } from "react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import ReactQuill from "react-quill-new";
import "react-quill-new/dist/quill.snow.css";
import {
  ArrowLeft,
  Send,
  Calendar,
  Clock,
  Users,
  Coins,
  AlertTriangle,
  Loader2,
  CheckCircle2,
  Upload,
  FileText,
  Lock,
  Sparkles,
  X,
  HelpCircle,
  Image as ImageIcon,
  Video as VideoIcon,
  Trash2,
  Plus,
  RefreshCw,
  CheckCheck,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/toast";
import apiClient from "@/api/client";
import { number } from "@/features/admin/lib/format";

const WORD_LIMIT = 1024;

function formatFileSize(bytes) {
  if (!bytes) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function CreateCampaignPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const fileInputRef = useRef(null);
  const quillRef = useRef(null);

  // Dedicated media input refs: 1 Image, 1 Video, 1 PDF
  const imageInputRef = useRef(null);
  const videoInputRef = useRef(null);
  const pdfInputRef = useRef(null);

  // Determine base path (e.g. /reseller or /admin)
  const isReseller = location.pathname.startsWith("/reseller");
  const parentCampaignsPath = isReseller ? "/reseller/campaigns" : "/admin/campaigns";

  // Form states
  const [campaignTitle, setCampaignTitle] = useState("");
  const [campaignDescription, setCampaignDescription] = useState("");
  const [messageBody, setMessageBody] = useState("");
  const [rawRecipients, setRawRecipients] = useState("");
  const [scheduleType, setScheduleType] = useState("now"); // "now" | "later"
  const [scheduledTime, setScheduledTime] = useState("");
  const [formError, setFormError] = useState("");

  // Media files states: Exactly 1 Image, 1 Video, 1 PDF (nothing else)
  const [imageFile, setImageFile] = useState(null); // { file, preview, name, size }
  const [videoFile, setVideoFile] = useState(null); // { file, preview, name, size }
  const [pdfFile, setPdfFile] = useState(null); // { file, name, size }

  // Fetch current user wallet balance
  const balanceQuery = useQuery({
    queryKey: ["myWalletBalance"],
    queryFn: async () => {
      const res = await apiClient.get("/credits/balance");
      return res.data;
    },
  });

  const wallet = balanceQuery.data?.wallet || {};
  const currentBalance = wallet.balance || 0;
  const isLocked = wallet.isLocked || false;

  // Quill Editor Configuration
  const quillModules = useMemo(
    () => ({
      toolbar: [
        ["bold", "italic", "underline", "strike"],
        [{ list: "ordered" }, { list: "bullet" }],
        ["blockquote", "code-block"],
        ["clean"],
      ],
    }),
    []
  );

  const quillFormats = [
    "bold",
    "italic",
    "underline",
    "strike",
    "list",
    "bullet",
    "blockquote",
    "code-block",
  ];

  // Calculate live word count & character count
  const wordCount = useMemo(() => {
    if (!messageBody) return 0;
    const text = messageBody
      .replace(/<[^>]*>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, '"')
      .trim();
    if (!text) return 0;
    return text.split(/\s+/).filter(Boolean).length;
  }, [messageBody]);

  const charCount = useMemo(() => {
    if (!messageBody) return 0;
    return messageBody.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim().length;
  }, [messageBody]);

  const isOverWordLimit = wordCount > WORD_LIMIT;

  // Insert tag into Quill editor at cursor position
  const insertVariable = (tag) => {
    const editor = quillRef.current?.getEditor();
    if (editor) {
      const range = editor.getSelection(true);
      const position = range ? range.index : editor.getLength() - 1;
      editor.insertText(position, `{{${tag}}} `);
      editor.setSelection(position + tag.length + 5);
    } else {
      setMessageBody((prev) => `${prev} {{${tag}}} `);
    }
  };

  // --- 1 Image Handler ---
  const handleImageSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const MAX_IMG_SIZE = 5 * 1024 * 1024; // 5 MB
    if (file.size > MAX_IMG_SIZE) {
      toast.add({
        title: "Image Exceeds 5 MB",
        description: `"${file.name}" is larger than 5 MB limit.`,
        type: "error",
      });
      if (imageInputRef.current) imageInputRef.current.value = "";
      return;
    }

    if (imageFile?.preview) URL.revokeObjectURL(imageFile.preview);

    setImageFile({
      file,
      preview: URL.createObjectURL(file),
      name: file.name,
      size: file.size,
    });

    if (imageInputRef.current) imageInputRef.current.value = "";
  };

  const removeImage = () => {
    if (imageFile?.preview) URL.revokeObjectURL(imageFile.preview);
    setImageFile(null);
    if (imageInputRef.current) imageInputRef.current.value = "";
  };

  // --- 1 Video Handler ---
  const handleVideoSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const MAX_VID_SIZE = 7 * 1024 * 1024; // 7 MB
    if (file.size > MAX_VID_SIZE) {
      toast.add({
        title: "Video Exceeds 7 MB",
        description: `"${file.name}" is larger than 7 MB limit.`,
        type: "error",
      });
      if (videoInputRef.current) videoInputRef.current.value = "";
      return;
    }

    if (videoFile?.preview) URL.revokeObjectURL(videoFile.preview);

    setVideoFile({
      file,
      preview: URL.createObjectURL(file),
      name: file.name,
      size: file.size,
    });

    if (videoInputRef.current) videoInputRef.current.value = "";
  };

  const removeVideo = () => {
    if (videoFile?.preview) URL.revokeObjectURL(videoFile.preview);
    setVideoFile(null);
    if (videoInputRef.current) videoInputRef.current.value = "";
  };

  // --- 1 PDF Handler ---
  const handlePdfSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const MAX_PDF_SIZE = 5 * 1024 * 1024; // 5 MB
    if (file.size > MAX_PDF_SIZE) {
      toast.add({
        title: "PDF Exceeds 5 MB",
        description: `"${file.name}" is larger than 5 MB limit.`,
        type: "error",
      });
      if (pdfInputRef.current) pdfInputRef.current.value = "";
      return;
    }

    setPdfFile({
      file,
      name: file.name,
      size: file.size,
    });

    if (pdfInputRef.current) pdfInputRef.current.value = "";
  };

  const removePdf = () => {
    setPdfFile(null);
    if (pdfInputRef.current) pdfInputRef.current.value = "";
  };

  // Real-time phone numbers parsing and sanitization
  const { validRecipients, duplicatesCount, invalidCount } = useMemo(() => {
    if (!rawRecipients.trim()) {
      return { validRecipients: [], duplicatesCount: 0, invalidCount: 0 };
    }

    const tokens = rawRecipients
      .split(/[\n,;\t]+/)
      .map((t) => t.trim())
      .filter(Boolean);

    const seen = new Set();
    const valid = [];
    let duplicates = 0;
    let invalid = 0;

    for (const token of tokens) {
      const cleaned = token.replace(/\D/g, "");
      if (cleaned.length < 8 || cleaned.length > 15) {
        invalid++;
      } else if (seen.has(cleaned)) {
        duplicates++;
      } else {
        seen.add(cleaned);
        valid.push(cleaned);
      }
    }

    return { validRecipients: valid, duplicatesCount: duplicates, invalidCount: invalid };
  }, [rawRecipients]);

  const totalRecipients = validRecipients.length;
  const estimatedCost = totalRecipients; // 1 credit per contact
  const remainingBalance = currentBalance - estimatedCost;
  const hasInsufficientCredits = !isLocked && currentBalance < estimatedCost && totalRecipients > 0;
  const totalMediaCount = (imageFile ? 1 : 0) + (videoFile ? 1 : 0) + (pdfFile ? 1 : 0);

  // Handle CSV/TXT recipient file upload
  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result;
      if (typeof content === "string") {
        setRawRecipients((prev) => {
          const combined = prev ? `${prev}\n${content}` : content;
          return combined;
        });
        toast.add({
          title: "Numbers Imported",
          description: `Imported file: ${file.name}`,
          type: "success",
        });
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // Create Campaign Mutation
  const createCampaignMutation = useMutation({
    mutationFn: async (payload) => {
      const res = await apiClient.post("/campaigns", payload, {
        headers: payload instanceof FormData ? { "Content-Type": "multipart/form-data" } : undefined,
      });
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries(["campaigns"]);
      queryClient.invalidateQueries(["reseller"]);
      queryClient.invalidateQueries(["admin"]);
      queryClient.invalidateQueries(["myWalletBalance"]);

      toast.add({
        title: "Campaign Created Successfully!",
        description: data.message || `Campaign '${campaignTitle}' has been queued for execution.`,
        type: "success",
      });

      navigate(parentCampaignsPath);
    },
    onError: (err) => {
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        "Failed to launch campaign. Please verify your inputs.";
      setFormError(msg);
      toast.add({
        title: "Campaign Submission Failed",
        description: msg,
        type: "error",
      });
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    setFormError("");

    if (isLocked) {
      setFormError("Your credit balance is expired and locked. Please contact your administrator.");
      return;
    }
    if (!campaignTitle.trim()) {
      setFormError("Please provide a campaign title.");
      return;
    }
    if (!campaignDescription.trim()) {
      setFormError("Please provide a brief campaign description.");
      return;
    }

    const plainText = messageBody.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
    if (!plainText && totalMediaCount === 0) {
      setFormError("Please provide message content or attach media (image, video, or PDF).");
      return;
    }
    if (isOverWordLimit) {
      setFormError(`Message exceeds the maximum limit of ${WORD_LIMIT} words (currently ${wordCount} words). Please shorten your message.`);
      return;
    }
    if (totalRecipients === 0) {
      setFormError("Please provide at least one valid recipient phone number.");
      return;
    }
    if (hasInsufficientCredits) {
      setFormError(`Insufficient credits. You need ${estimatedCost} credits but currently hold ${currentBalance}.`);
      return;
    }
    if (scheduleType === "later" && !scheduledTime) {
      setFormError("Please select a valid scheduled date and time.");
      return;
    }

    // Always use FormData to support media uploads seamlessly
    const formData = new FormData();
    formData.append("campaignTitle", campaignTitle.trim());
    formData.append("campaignDescription", campaignDescription.trim());
    formData.append("messageBody", messageBody.trim());
    formData.append("recipients", JSON.stringify(validRecipients));
    formData.append("schedule", scheduleType);
    if (scheduleType === "later" && scheduledTime) {
      formData.append("scheduledTime", new Date(scheduledTime).toISOString());
    }

    // Append 1 Image, 1 Video, 1 PDF (nothing else)
    if (imageFile) {
      formData.append("images", imageFile.file);
    }
    if (videoFile) {
      formData.append("video", videoFile.file);
    }
    if (pdfFile) {
      formData.append("documents", pdfFile.file);
    }

    createCampaignMutation.mutate(formData);
  };

  return (
    <div className="space-y-6 pb-12 max-w-7xl mx-auto">
      {/* Quill Custom Scoped Styling */}
      <style>{`
        .quill-editor-container .ql-toolbar.ql-snow {
          border-top-left-radius: 0.75rem;
          border-top-right-radius: 0.75rem;
          border-color: var(--border);
          background-color: var(--muted);
          padding: 0.5rem 0.75rem;
        }
        .quill-editor-container .ql-container.ql-snow {
          border-bottom-left-radius: 0.75rem;
          border-bottom-right-radius: 0.75rem;
          border-color: var(--border);
          background-color: var(--card);
          font-family: inherit;
          font-size: 0.875rem;
          min-height: 180px;
        }
        .quill-editor-container .ql-editor {
          min-height: 160px;
          font-size: 0.875rem;
          line-height: 1.6;
          color: var(--foreground);
        }
        .quill-editor-container .ql-editor.ql-blank::before {
          color: var(--muted-foreground);
          font-style: normal;
        }
        .dark .quill-editor-container .ql-snow .ql-stroke {
          stroke: var(--foreground);
        }
        .dark .quill-editor-container .ql-snow .ql-fill {
          fill: var(--foreground);
        }
        .dark .quill-editor-container .ql-snow .ql-picker {
          color: var(--foreground);
        }
      `}</style>

      {/* Top Header with Breadcrumbs and Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b pb-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium">
            <Link to={parentCampaignsPath} className="hover:text-foreground transition-colors">
              Campaigns
            </Link>
            <span>/</span>
            <span className="text-foreground font-semibold">New Campaign</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Create Campaign
          </h1>
          <p className="text-sm text-muted-foreground">
            Configure your message, attach media files, upload target audience, and dispatch your broadcast.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate(parentCampaignsPath)}
            disabled={createCampaignMutation.isPending}
          >
            <ArrowLeft className="size-4 mr-1.5" />
            Back to Campaigns
          </Button>

          <Button
            type="button"
            onClick={handleSubmit}
            disabled={createCampaignMutation.isPending || isLocked || hasInsufficientCredits || isOverWordLimit}
            className="font-semibold shadow-xs"
          >
            {createCampaignMutation.isPending ? (
              <Loader2 className="size-4 mr-2 animate-spin" />
            ) : (
              <Send className="size-4 mr-2" />
            )}
            {scheduleType === "later" ? "Schedule Campaign" : "Launch Campaign"}
          </Button>
        </div>
      </div>

      {formError && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-destructive/10 text-destructive text-sm font-medium border border-destructive/20">
          <AlertTriangle className="size-5 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold">Unable to submit campaign</p>
            <p className="text-xs">{formError}</p>
          </div>
        </div>
      )}

      {isLocked && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-red-100 dark:bg-red-950/40 text-red-900 dark:text-red-200 text-sm font-medium border border-red-300 dark:border-red-900">
          <Lock className="size-5 shrink-0 text-red-600" />
          <div>
            <p className="font-semibold">Credit Wallet Locked & Expired</p>
            <p className="text-xs text-red-700 dark:text-red-300">
              Your credit allocation has expired. Creating campaigns is disabled until renewed by Super Admin.
            </p>
          </div>
        </div>
      )}

      {/* Main 2-Column Responsive Workspace */}
      <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Form Fields (8 cols) */}
        <div className="lg:col-span-8 space-y-6">
          {/* Card 1: Campaign Details */}
          <Card className="rounded-xl border shadow-xs">
            <CardHeader className="border-b pb-4">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <FileText className="size-4.5 text-primary" />
                Campaign Details
              </CardTitle>
              <CardDescription className="text-xs">
                Provide an internal name and description to track this broadcast.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-5 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="title" className="text-xs font-semibold">
                  Campaign Title <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="title"
                  placeholder="e.g. Diwali Fest Special Offer 2026"
                  value={campaignTitle}
                  onChange={(e) => setCampaignTitle(e.target.value)}
                  className="text-sm"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="description" className="text-xs font-semibold">
                  Description / Purpose <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="description"
                  placeholder="e.g. 20% flat discount promotion blast to customer contacts"
                  value={campaignDescription}
                  onChange={(e) => setCampaignDescription(e.target.value)}
                  className="text-sm"
                  required
                />
              </div>
            </CardContent>
          </Card>

          {/* Card 2: Message Content (Quill with 1024 Words Limit) */}
          <Card className="rounded-xl border shadow-xs">
            <CardHeader className="border-b pb-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <Sparkles className="size-4.5 text-primary" />
                    Message Composer
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Draft your WhatsApp message text with formatting and personalization tags.
                  </CardDescription>
                </div>

                <div className="flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className={`text-xs tabular-nums font-semibold transition-colors ${
                      isOverWordLimit
                        ? "border-destructive bg-destructive/10 text-destructive font-bold"
                        : wordCount > 900
                        ? "border-amber-500 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                        : "border-border text-foreground"
                    }`}
                  >
                    {number(wordCount)} / {number(WORD_LIMIT)} words
                  </Badge>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    ({number(charCount)} chars)
                  </span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-5 space-y-3">
              <div className="flex items-center gap-2 flex-wrap pb-1">
                <span className="text-xs font-medium text-muted-foreground mr-1">Insert Tags:</span>
                <button
                  type="button"
                  onClick={() => insertVariable("name")}
                  className="px-2.5 py-1 text-xs rounded-md bg-muted hover:bg-muted/80 text-foreground font-mono transition-colors border border-border/60 hover:border-primary/40 cursor-pointer"
                >
                  &#123;&#123;name&#125;&#125;
                </button>
                <button
                  type="button"
                  onClick={() => insertVariable("phone")}
                  className="px-2.5 py-1 text-xs rounded-md bg-muted hover:bg-muted/80 text-foreground font-mono transition-colors border border-border/60 hover:border-primary/40 cursor-pointer"
                >
                  &#123;&#123;phone&#125;&#125;
                </button>
              </div>

              {/* React Quill Editor Container */}
              <div className="quill-editor-container">
                <ReactQuill
                  ref={quillRef}
                  theme="snow"
                  value={messageBody}
                  onChange={setMessageBody}
                  modules={quillModules}
                  formats={quillFormats}
                  placeholder="Hello {{name}}, we are thrilled to bring you our exclusive discounts! Type your message here..."
                />
              </div>

              {isOverWordLimit && (
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-destructive/10 text-destructive text-xs font-semibold border border-destructive/20 animate-shake">
                  <AlertTriangle className="size-4 shrink-0" />
                  <span>
                    Word limit exceeded! Your message has {number(wordCount)} words (maximum allowed is {number(WORD_LIMIT)} words). Please reduce text by {number(wordCount - WORD_LIMIT)} words.
                  </span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Card 3: Campaign Attachments (1 Image, 1 Video, 1 PDF nothing else) */}
          <Card className="rounded-xl border shadow-xs">
            <CardHeader className="border-b pb-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <Upload className="size-4.5 text-primary" />
                    Campaign Attachments
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Attach 1 Image, 1 Video, and 1 PDF document to your broadcast.
                  </CardDescription>
                </div>

                {totalMediaCount > 0 && (
                  <Badge variant="outline" className="text-xs bg-primary/5 text-primary border-primary/20">
                    {totalMediaCount} / 3 attached
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="pt-5 space-y-4">
              {/* Field 1: Exactly 1 Image */}
              <div className="rounded-xl border p-3.5 bg-card space-y-2.5">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="grid size-8 place-items-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                      <ImageIcon className="size-4.5" />
                    </div>
                    <div>
                      <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                        Image
                        <span className="text-[10px] text-muted-foreground font-normal">(1 file max)</span>
                      </Label>
                      <p className="text-[11px] text-muted-foreground">
                        PNG, JPG, WebP &bull; Max 5 MB
                      </p>
                    </div>
                  </div>

                  <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={handleImageSelect}
                    className="hidden"
                  />

                  <Button
                    type="button"
                    variant={imageFile ? "outline" : "default"}
                    size="sm"
                    onClick={() => imageInputRef.current?.click()}
                    className="h-8 text-xs gap-1.5"
                  >
                    {imageFile ? <RefreshCw className="size-3" /> : <Plus className="size-3" />}
                    {imageFile ? "Change Image" : "Choose Image"}
                  </Button>
                </div>

                {imageFile && (
                  <div className="rounded-lg border bg-muted/30 p-2 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="size-10 rounded-md overflow-hidden bg-black/5 shrink-0 border">
                        <img
                          src={imageFile.preview}
                          alt={imageFile.name}
                          className="h-full w-full object-cover"
                        />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-foreground truncate max-w-[200px]" title={imageFile.name}>
                          {imageFile.name}
                        </p>
                        <p className="text-[10px] text-muted-foreground tabular-nums">
                          {formatFileSize(imageFile.size)}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={removeImage}
                      className="grid size-7 place-items-center rounded-md text-destructive hover:bg-destructive/10 transition-colors shrink-0 cursor-pointer"
                      title="Remove image"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                )}
              </div>

              {/* Field 2: Exactly 1 Video */}
              <div className="rounded-xl border p-3.5 bg-card space-y-2.5">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="grid size-8 place-items-center rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400">
                      <VideoIcon className="size-4.5" />
                    </div>
                    <div>
                      <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                        Video
                        <span className="text-[10px] text-muted-foreground font-normal">(1 file max)</span>
                      </Label>
                      <p className="text-[11px] text-muted-foreground">
                        MP4, MOV, WebM &bull; Max 7 MB
                      </p>
                    </div>
                  </div>

                  <input
                    ref={videoInputRef}
                    type="file"
                    accept="video/mp4,video/quicktime,video/webm"
                    onChange={handleVideoSelect}
                    className="hidden"
                  />

                  <Button
                    type="button"
                    variant={videoFile ? "outline" : "default"}
                    size="sm"
                    onClick={() => videoInputRef.current?.click()}
                    className="h-8 text-xs gap-1.5"
                  >
                    {videoFile ? <RefreshCw className="size-3" /> : <Plus className="size-3" />}
                    {videoFile ? "Change Video" : "Choose Video"}
                  </Button>
                </div>

                {videoFile && (
                  <div className="rounded-lg border bg-muted/30 p-2.5 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400">
                        <VideoIcon className="size-4.5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-foreground truncate max-w-[200px]" title={videoFile.name}>
                          {videoFile.name}
                        </p>
                        <p className="text-[10px] text-muted-foreground tabular-nums">
                          {formatFileSize(videoFile.size)} &bull; Video Clip
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={removeVideo}
                      className="grid size-7 place-items-center rounded-md text-destructive hover:bg-destructive/10 transition-colors shrink-0 cursor-pointer"
                      title="Remove video"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                )}
              </div>

              {/* Field 3: Exactly 1 PDF */}
              <div className="rounded-xl border p-3.5 bg-card space-y-2.5">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="grid size-8 place-items-center rounded-lg bg-red-500/10 text-red-600 dark:text-red-400">
                      <FileText className="size-4.5" />
                    </div>
                    <div>
                      <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                        PDF Document
                        <span className="text-[10px] text-muted-foreground font-normal">(1 file max)</span>
                      </Label>
                      <p className="text-[11px] text-muted-foreground">
                        PDF only &bull; Max 5 MB
                      </p>
                    </div>
                  </div>

                  <input
                    ref={pdfInputRef}
                    type="file"
                    accept="application/pdf,.pdf"
                    onChange={handlePdfSelect}
                    className="hidden"
                  />

                  <Button
                    type="button"
                    variant={pdfFile ? "outline" : "default"}
                    size="sm"
                    onClick={() => pdfInputRef.current?.click()}
                    className="h-8 text-xs gap-1.5"
                  >
                    {pdfFile ? <RefreshCw className="size-3" /> : <Plus className="size-3" />}
                    {pdfFile ? "Change PDF" : "Choose PDF"}
                  </Button>
                </div>

                {pdfFile && (
                  <div className="rounded-lg border bg-muted/30 p-2.5 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-red-500/10 text-red-600 dark:text-red-400 font-bold text-xs">
                        PDF
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-foreground truncate max-w-[200px]" title={pdfFile.name}>
                          {pdfFile.name}
                        </p>
                        <p className="text-[10px] text-muted-foreground tabular-nums">
                          {formatFileSize(pdfFile.size)} &bull; Document
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={removePdf}
                      className="grid size-7 place-items-center rounded-md text-destructive hover:bg-destructive/10 transition-colors shrink-0 cursor-pointer"
                      title="Remove PDF"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Card 4: Audience & Recipients */}
          <Card className="rounded-xl border shadow-xs">
            <CardHeader className="border-b pb-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <Users className="size-4.5 text-primary" />
                    Target Audience
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Paste recipient numbers or upload a contact file.
                  </CardDescription>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.txt"
                    onChange={handleFileUpload}
                    className="hidden"
                    id="file-upload"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    className="h-8 text-xs gap-1.5"
                  >
                    <Upload className="size-3.5" />
                    Upload CSV / TXT
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-5 space-y-3">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="recipients" className="text-xs font-semibold">
                    Phone Numbers <span className="text-destructive">*</span>
                  </Label>
                  <span className="text-xs text-muted-foreground">
                    Separated by newline, comma, or space
                  </span>
                </div>

                <Textarea
                  id="recipients"
                  rows={5}
                  value={rawRecipients}
                  onChange={(e) => setRawRecipients(e.target.value)}
                  placeholder="Paste numbers with country code:&#10;919876543210&#10;919876543211&#10;919876543212"
                  className="text-xs font-mono resize-y"
                  required
                />
              </div>

              {/* Recipient breakdown chips */}
              <div className="flex items-center gap-2 flex-wrap pt-1">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 text-xs font-medium border border-emerald-200 dark:border-emerald-800">
                  <CheckCircle2 className="size-3.5" />
                  {totalRecipients} Valid Contacts
                </span>

                {duplicatesCount > 0 && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 text-xs font-medium border border-amber-200 dark:border-amber-800">
                    <AlertTriangle className="size-3.5" />
                    {duplicatesCount} Duplicates Skipped
                  </span>
                )}

                {invalidCount > 0 && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300 text-xs font-medium border border-red-200 dark:border-red-800">
                    <X className="size-3.5" />
                    {invalidCount} Invalid Skipped
                  </span>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Card 5: Execution Timing */}
          <Card className="rounded-xl border shadow-xs">
            <CardHeader className="border-b pb-4">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Clock className="size-4.5 text-primary" />
                Execution Timing
              </CardTitle>
              <CardDescription className="text-xs">
                Choose when the message queue should begin delivery.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setScheduleType("now")}
                  className={`flex items-start gap-3 p-3.5 rounded-xl border text-left cursor-pointer transition-all ${
                    scheduleType === "now"
                      ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                      : "border-border bg-card hover:bg-muted/30"
                  }`}
                >
                  <div
                    className={`grid size-8 shrink-0 place-items-center rounded-lg ${
                      scheduleType === "now" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    <Send className="size-4" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">Send Immediately</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Messages are queued and dispatched right away.
                    </p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setScheduleType("later")}
                  className={`flex items-start gap-3 p-3.5 rounded-xl border text-left cursor-pointer transition-all ${
                    scheduleType === "later"
                      ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                      : "border-border bg-card hover:bg-muted/30"
                  }`}
                >
                  <div
                    className={`grid size-8 shrink-0 place-items-center rounded-lg ${
                      scheduleType === "later" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    <Calendar className="size-4" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">Schedule for Later</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Set a future date and time to trigger dispatch.
                    </p>
                  </div>
                </button>
              </div>

              {scheduleType === "later" && (
                <div className="space-y-1.5 pt-2 border-t">
                  <Label htmlFor="scheduledTime" className="text-xs font-semibold">
                    Scheduled Date & Time <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="scheduledTime"
                    type="datetime-local"
                    value={scheduledTime}
                    onChange={(e) => setScheduledTime(e.target.value)}
                    className="text-sm max-w-sm"
                    required
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Operating window rules configured in settings will be respected during execution.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Credits & Execution Summary (4 cols) */}
        <div className="lg:col-span-4 space-y-6 lg:sticky lg:top-4">
          {/* Credits Summary Card */}
          <Card className="rounded-xl border shadow-xs">
            <CardHeader className="border-b pb-4">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Coins className="size-4.5 text-primary" />
                Credits & Execution Summary
              </CardTitle>
              <CardDescription className="text-xs">
                Live cost calculation based on validated contacts.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-5 space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Target Recipients</span>
                <span className="font-semibold tabular-nums text-foreground">
                  {number(totalRecipients)}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Rate per Message</span>
                <span className="font-semibold tabular-nums text-foreground">1 Credit</span>
              </div>

              <div className="border-t pt-3 flex items-center justify-between">
                <span className="font-semibold text-foreground">Total Required Credits</span>
                <span className={`font-bold tabular-nums text-base ${hasInsufficientCredits ? "text-destructive" : "text-primary"}`}>
                  {number(estimatedCost)} Credits
                </span>
              </div>

              <div className="flex items-center justify-between text-xs pt-1">
                <span className="text-muted-foreground">Available Wallet Balance</span>
                <span className="font-semibold tabular-nums text-foreground">
                  {number(currentBalance)} Credits
                </span>
              </div>

              <div className="flex items-center justify-between text-xs border-t pt-2">
                <span className="text-muted-foreground">Balance After Launch</span>
                <span
                  className={`font-semibold tabular-nums ${
                    remainingBalance < 0 ? "text-destructive" : "text-emerald-600"
                  }`}
                >
                  {number(remainingBalance)} Credits
                </span>
              </div>

              {/* Media Attachments Summary */}
              {totalMediaCount > 0 && (
                <div className="rounded-lg bg-muted/40 p-2.5 text-xs border border-border/60 space-y-1 mt-2">
                  <p className="font-semibold text-foreground flex items-center justify-between">
                    <span>Attached Media</span>
                    <span className="tabular-nums text-primary">{totalMediaCount} / 3</span>
                  </p>
                  <div className="text-[11px] text-muted-foreground space-y-0.5">
                    {imageFile && (
                      <p className="flex items-center justify-between">
                        <span>Image:</span>
                        <span className="font-medium text-foreground truncate max-w-[140px]">{imageFile.name}</span>
                      </p>
                    )}
                    {videoFile && (
                      <p className="flex items-center justify-between">
                        <span>Video:</span>
                        <span className="font-medium text-foreground truncate max-w-[140px]">{videoFile.name}</span>
                      </p>
                    )}
                    {pdfFile && (
                      <p className="flex items-center justify-between">
                        <span>PDF:</span>
                        <span className="font-medium text-foreground truncate max-w-[140px]">{pdfFile.name}</span>
                      </p>
                    )}
                  </div>
                </div>
              )}

              {hasInsufficientCredits && (
                <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-xs font-semibold border border-destructive/20 mt-2">
                  Insufficient balance! You need {number(estimatedCost - currentBalance)} more credits to dispatch this campaign.
                </div>
              )}

              {isOverWordLimit && (
                <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-xs font-semibold border border-destructive/20 mt-2">
                  Cannot launch: Message exceeds the 1024 words limit ({number(wordCount)} words).
                </div>
              )}
            </CardContent>

            <CardFooter className="border-t pt-4 flex flex-col gap-2">
              <Button
                type="submit"
                disabled={createCampaignMutation.isPending || isLocked || hasInsufficientCredits || isOverWordLimit}
                className="w-full font-semibold h-10 shadow-xs"
              >
                {createCampaignMutation.isPending ? (
                  <Loader2 className="size-4 mr-2 animate-spin" />
                ) : (
                  <Send className="size-4 mr-2" />
                )}
                {scheduleType === "later" ? "Schedule Campaign" : "Launch Campaign"}
              </Button>

              <Button
                type="button"
                variant="ghost"
                onClick={() => navigate(parentCampaignsPath)}
                className="w-full text-xs text-muted-foreground"
              >
                Cancel and Return
              </Button>
            </CardFooter>
          </Card>

          {/* WhatsApp Live Broadcast Preview Card */}
          <div className="rounded-2xl border overflow-hidden shadow-xs bg-card">
            {/* WhatsApp Header Bar */}
            <div className="bg-primary text-primary-foreground p-3.5 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="grid size-9 place-items-center rounded-full bg-primary-foreground/20 text-primary-foreground font-bold text-xs uppercase">
                  GW
                </div>
                <div>
                  <p className="text-xs font-semibold leading-tight">go2web Broadcast</p>
                  <p className="text-[10px] text-primary-foreground/80 leading-tight">online</p>
                </div>
              </div>
              <span className="rounded-full bg-primary-foreground/20 px-2.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
                Live Preview
              </span>
            </div>

            {/* Chat Area Background */}
            <div className="bg-[#f0ebe3] dark:bg-muted/30 p-4 min-h-[180px] max-h-[380px] overflow-y-auto space-y-3 flex flex-col justify-between">
              {/* Today Date Divider */}
              <div className="flex justify-center">
                <span className="bg-card/90 dark:bg-card px-2.5 py-0.5 rounded-full text-[10px] font-semibold text-muted-foreground shadow-2xs uppercase tracking-wider">
                  Today
                </span>
              </div>

              {/* WhatsApp Speech Bubble */}
              <div className="self-end max-w-[92%] rounded-xl rounded-tr-xs bg-[#d9fdd3] dark:bg-primary/20 text-foreground p-3 shadow-2xs space-y-2 border border-emerald-200/50 dark:border-primary/30">
                {/* 1 Image Preview */}
                {imageFile?.preview && (
                  <div className="rounded-lg overflow-hidden border border-black/5 bg-black/5">
                    <img
                      src={imageFile.preview}
                      alt={imageFile.name}
                      className="w-full max-h-40 object-cover"
                    />
                  </div>
                )}

                {/* 1 Video Preview */}
                {videoFile?.preview && (
                  <div className="rounded-lg overflow-hidden border border-black/5 bg-black/10 p-2 flex items-center gap-2">
                    <div className="grid size-8 place-items-center rounded-md bg-primary text-primary-foreground shrink-0">
                      <VideoIcon className="size-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-medium truncate text-foreground">{videoFile.name}</p>
                      <p className="text-[10px] text-muted-foreground">{formatFileSize(videoFile.size)}</p>
                    </div>
                  </div>
                )}

                {/* 1 PDF Preview */}
                {pdfFile && (
                  <div className="rounded-lg overflow-hidden border border-black/5 bg-card/80 p-2 flex items-center gap-2">
                    <div className="grid size-8 place-items-center rounded-md bg-red-600 text-white shrink-0 font-bold text-[10px]">
                      PDF
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-medium truncate text-foreground">{pdfFile.name}</p>
                      <p className="text-[10px] text-muted-foreground">{formatFileSize(pdfFile.size)}</p>
                    </div>
                  </div>
                )}

                {/* Message Body Render */}
                {charCount > 0 ? (
                  <div
                    className="prose prose-sm dark:prose-invert max-w-none text-xs leading-relaxed break-words"
                    dangerouslySetInnerHTML={{ __html: messageBody }}
                  />
                ) : (
                  <p className="text-xs text-muted-foreground/80 italic leading-relaxed">
                    Your composed WhatsApp broadcast message will appear here in real-time…
                  </p>
                )}

                {/* Timestamp & Double Checkmark */}
                <div className="flex items-center justify-end gap-1 text-[10px] text-muted-foreground/90 pt-0.5">
                  <span>
                    {new Intl.DateTimeFormat("en-IN", {
                      timeZone: "Asia/Kolkata",
                      hour: "2-digit",
                      minute: "2-digit",
                      hour12: true,
                    }).format(new Date())}
                  </span>
                  <CheckCheck className="size-3.5 text-sky-600 dark:text-sky-400" />
                </div>
              </div>
            </div>

            {/* Bottom Guarantee Banner */}
            <div className="bg-[#1c1917] text-[#a8a29e] text-center text-[11px] py-2 px-3">
              Recipient will receive message formatted exactly as rendered above.
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
