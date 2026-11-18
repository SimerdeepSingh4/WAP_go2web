import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useLocation, useNavigate } from "react-router";
import { useAuthContext } from "@/features/auth/context/auth.context";
import { useBranding } from "@/features/branding/context/BrandingContext";
import { toast } from "@/components/ui/toast";
import { X, GripHorizontal, Pin, Eye, EyeOff, Globe, MapPin, CheckCircle2, ExternalLink, HelpCircle } from "lucide-react";
import { useReviewPins, useAllReviewPins, useCreatePin, useDeletePin, useResolvePin } from "@/features/review-pins/hooks/useReviewPins";
import { useLeadDev } from "@/features/review-pins/lib/leadDev";
import { startReviewPinsTour } from "@/features/review-pins/lib/reviewPinsTour";
import { readResolverName, rememberResolverName } from "@/features/review-pins/lib/resolverIdentity";
import { computeAnchor, resolveElement } from "@/features/review-pins/lib/pinAnchor";
import { PinPlacementOverlay } from "@/features/review-pins/components/PinPlacementOverlay";
import { PinForm } from "@/features/review-pins/components/PinForm";
import { PinMarker } from "@/features/review-pins/components/PinMarker";
import { PinPopover } from "@/features/review-pins/components/PinPopover";
import "./skiper46.css";

const springTransition = {
  type: "spring",
  stiffness: 320,
  damping: 28,
};

export default function ReviewPinsButton() {
  const [isOpen, setIsOpen] = useState(false);
  const [placingPin, setPlacingPin] = useState(false);
  const [pinsVisible, setPinsVisible] = useState(true);
  const [pendingPlacement, setPendingPlacement] = useState(null); // { el, clientX, clientY, anchor }
  const [activePopoverPin, setActivePopoverPin] = useState(null);
  const hasDragged = useRef(false);

  const navigate = useNavigate();
  const location = useLocation();
  const pathname = location.pathname;
  const { user } = useAuthContext();
  const userId = user?._id || user?.id;
  const [resolverIdentity, setResolverIdentity] = useState({ userId: null, name: "" });
  const resolverName = resolverIdentity.userId === userId ? resolverIdentity.name : readResolverName(userId);
  const { branding } = useBranding();

  // Lead Developer mode state & global tracking
  const { isLeadDev } = useLeadDev();
  const [devTab, setDevTab] = useState("page"); // "page" | "all"
  const [filterStatus, setFilterStatus] = useState("all"); // "all" | "open" | "resolved"

  const brandLogo =
    branding?.logoUrl ||
    "https://res.cloudinary.com/dyfjy8kmv/image/upload/v1793689940/Navy_Blue_Bird_Chat_Logo_n0udpf.webp";
  const brandName = branding?.brandName || "Promotion";

  // Fetch pins for current page
  const { data: pins = [], isLoading: pinsLoading } = useReviewPins();
  // Fetch all pins for Lead Developer mode
  const { data: allPins = [], isLoading: allPinsLoading } = useAllReviewPins(isLeadDev);

  const createPin = useCreatePin();
  const deletePin = useDeletePin();
  const resolvePin = useResolvePin();
  const activePin = activePopoverPin && (pins.find(pin => pin._id === activePopoverPin._id) || activePopoverPin);

  const unresolvedAllCount = allPins.filter((p) => p.status !== "resolved").length;

  // Driver.js Tour for onboarding & pointing out mistakes / improvements
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      const tourParam = url.searchParams.get("tour");
      const forceTour = tourParam === "1" || tourParam === "true";
      if (forceTour) {
        url.searchParams.delete("tour");
        window.history.replaceState({}, document.title, url.pathname + (url.search ? url.search : "") + url.hash);
      }
      const timer = setTimeout(() => {
        startReviewPinsTour(forceTour);
      }, 1200);
      return () => clearTimeout(timer);
    } catch {
      // ignore
    }
  }, []);

  // Jump to pin (scrolls or navigates across pages)
  function handleJumpToPin(pin) {
    if (!pin) return;
    setIsOpen(false);
    if (pin.page === pathname) {
      setActivePopoverPin(pin);
      if (pin.elementSelector) {
        const el = document.querySelector(pin.elementSelector);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          return;
        }
      }
      if (typeof pin.scrollY === "number") {
        window.scrollTo({ top: pin.scrollY, behavior: "smooth" });
      }
    } else {
      try {
        sessionStorage.setItem("target_review_pin_id", pin._id);
      } catch {
        // ignore
      }
      navigate(pin.page);
    }
  }

  // Auto-scroll and open pin popover if navigated with target_review_pin_id
  useEffect(() => {
    try {
      const targetId = sessionStorage.getItem("target_review_pin_id");
      if (targetId && pins.length > 0) {
        const target = pins.find((p) => p._id === targetId);
        if (target) {
          sessionStorage.removeItem("target_review_pin_id");
          setActivePopoverPin(target);
          setTimeout(() => {
            if (target.elementSelector) {
              const el = document.querySelector(target.elementSelector);
              if (el) {
                el.scrollIntoView({ behavior: "smooth", block: "center" });
                return;
              }
            }
            if (typeof target.scrollY === "number") {
              window.scrollTo({ top: target.scrollY, behavior: "smooth" });
            }
          }, 350);
        }
      }
    } catch {
      // ignore
    }
  }, [pathname, pins]);

  function handleResolvePin(pin, name) {
    if (!pin?._id || !name.trim() || resolvePin.isPending) return;
    resolvePin.mutate({ id: pin._id, resolvedByName: name.trim() }, {
      onSuccess: saved => {
        rememberResolverName(userId, name);
        setResolverIdentity({ userId, name: name.trim() });
        setActivePopoverPin(current => current?._id === pin._id ? saved : current);
        toast.add({ title: "Pin resolved", description: `Resolved by ${saved.resolvedByName}.`, type: "success" });
      },
    });
  }

  function handleDeletePin(pin) {
    if (!pin?._id) return;
    deletePin.mutate(pin._id, {
      onSuccess: () => {
        toast.add({
          title: "Pin deleted",
          type: "success",
        });
        setActivePopoverPin(null);
      },
      onError: (err) => {
        toast.add({
          title: "Failed to delete pin",
          description: err?.message || "An error occurred.",
          type: "error",
        });
      },
    });
  }

  // Cancel placement on Escape key
  const cancelPlacement = useCallback(() => {
    setPlacingPin(false);
    setPendingPlacement(null);
  }, []);

  useEffect(() => {
    if (!placingPin) return;
    function onKeyDown(e) {
      if (e.key === "Escape") cancelPlacement();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [placingPin, cancelPlacement]);

  function handlePlaced({ el, clientX, clientY }) {
    setPlacingPin(false);
    const anchor = computeAnchor({ el, clientX, clientY });
    setPendingPlacement({ el, clientX, clientY, anchor });
  }

  function handlePinFormSave({ testerName, description }) {
    if (!pendingPlacement) return;
    const { anchor } = pendingPlacement;
    createPin.mutate(
      {
        page: pathname,
        testerName,
        description,
        elementSelector: anchor.elementSelector,
        elementRelX: anchor.elementRelX,
        elementRelY: anchor.elementRelY,
        pageRelX: anchor.pageRelX,
        pageRelY: anchor.pageRelY,
        scrollY: window.scrollY,
      },
      {
        onSuccess: () => {
          toast.add({
            title: "Pin saved",
            description: "Your review pin was added successfully.",
            type: "success",
          });
          setPendingPlacement(null);
        },
        onError: (err) => {
          toast.add({
            title: "Failed to save pin",
            description: err?.message || "An error occurred.",
            type: "error",
          });
        },
      }
    );
  }

  function handlePinFormCancel() {
    setPendingPlacement(null);
  }

  if (!user) return null;

  const pageDisplayPath =
    pathname.length > 28 ? "…" + pathname.slice(-26) : pathname;

  const canDeletePin = (pin) =>
    user?.role === "Super Admin" ||
    pin.createdByUserId === user?._id ||
    pin.createdByUserId === user?.id;

  return (
    <>
      {/* SVG Gooey Filter Definition (Skiper46 standard) */}
      <svg
        className="pointer-events-none fixed -top-[9999px] -left-[9999px] size-0 opacity-0"
        aria-hidden="true"
      >
        <defs>
          <filter id="skiper46-goo">
            <feGaussianBlur in="SourceGraphic" stdDeviation="4.4" result="blur" />
            <feColorMatrix
              in="blur"
              mode="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -7"
              result="goo"
            />
            <feBlend in="SourceGraphic" in2="goo" />
          </filter>
        </defs>
      </svg>

      {/* Pin Placement Overlay */}
      <PinPlacementOverlay
        active={placingPin}
        onPlaced={handlePlaced}
        onCancel={cancelPlacement}
      />

      {/* Cancel Placement Pill (bottom center) */}
      <AnimatePresence>
        {placingPin && (
          <motion.button
            type="button"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.18 }}
            onClick={cancelPlacement}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-2 px-4 py-2 rounded-full bg-neutral-900 text-neutral-100 border border-neutral-700 shadow-lg text-xs font-medium hover:bg-neutral-800 transition-colors"
            title="Cancel pin placement (Esc)"
          >
            <X className="size-3.5" />
            Cancel placement
          </motion.button>
        )}
      </AnimatePresence>

      {/* Pin Form (after placement) */}
      <AnimatePresence>
        {pendingPlacement && (
          <PinForm
            placement={pendingPlacement}
            onSave={handlePinFormSave}
            onCancel={handlePinFormCancel}
            isSaving={createPin.isPending}
          />
        )}
      </AnimatePresence>

      {/* Rendered Pin Markers (when pinsVisible) */}
      {pinsVisible &&
        pins.map((pin, index) => (
          <PinMarker
            key={pin._id}
            pin={pin}
            number={index + 1}
            onClick={() => setActivePopoverPin(pin)}
          />
        ))}

      {/* Pin Popover for active pin */}
      <AnimatePresence>
        {activePin && (
          <PinPopover
            key={activePin._id}
            pin={activePin}
            onClose={() => setActivePopoverPin(null)}
            onDelete={handleDeletePin}
            canDelete={canDeletePin(activePin)}
            onResolve={handleResolvePin}
            resolverName={resolverName}
            isResolving={resolvePin.isPending}
            resolveError={resolvePin.variables?.id === activePin._id ? resolvePin.error?.message : undefined}
          />
        )}
      </AnimatePresence>

      {/* Draggable Dock */}
      <motion.div
        drag
        dragMomentum={false}
        dragElastic={0.06}
        onDragStart={() => {
          hasDragged.current = true;
        }}
        onDragEnd={() => {
          setTimeout(() => {
            hasDragged.current = false;
          }, 120);
        }}
        className="skiper46-dock fixed bottom-6 right-6 z-[9999]"
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 360, damping: 25 }}
      >
        {/* Gooey Layer */}
        <div className="skiper46-goo-container relative flex items-end justify-end">
          {/* Expanded Card Morphing from Button */}
          <AnimatePresence>
            {isOpen && (
              <motion.div
                initial={{
                  y: 0,
                  width: 48,
                  height: 48,
                  borderRadius: 24,
                }}
                animate={{
                  y: -56,
                  width: isLeadDev && devTab === "all" ? 340 : 280,
                  height: "auto",
                  borderRadius: 16,
                  transition: {
                    ...springTransition,
                    delay: 0.08,
                    y: { ...springTransition, delay: 0 },
                  },
                }}
                exit={{
                  y: 0,
                  width: 48,
                  height: 48,
                  borderRadius: 24,
                  transition: {
                    ...springTransition,
                    y: { ...springTransition, delay: 0.08 },
                  },
                }}
                className="skiper46-card absolute bottom-0 right-0 overflow-hidden"
              >
                {/* Sharp Inner Content (Fades & de-blurs) */}
                <motion.div
                  onPointerDown={(e) => {
                    e.stopPropagation();
                  }}
                  initial={{ opacity: 0, filter: "blur(4px)" }}
                  animate={{ opacity: 1, filter: "blur(0px)" }}
                  exit={{ opacity: 0, filter: "blur(4px)" }}
                  transition={{ duration: 0.18, delay: 0.12 }}
                  className={`${isLeadDev && devTab === "all" ? "w-[340px]" : "w-[280px]"} p-4 text-xs font-sans text-neutral-200 space-y-3`}
                >
                  {/* Card Header */}
                  <div className="flex items-center justify-between pb-2 border-b border-neutral-800">
                    <div className="flex items-center gap-2">
                      <div className="size-6 rounded-full bg-neutral-900 border border-neutral-700 flex items-center justify-center p-0.5 overflow-hidden">
                        <img
                          src={brandLogo}
                          alt={brandName}
                          className="size-5 object-contain"
                        />
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-white tracking-tight text-[13px]">
                          Review Pins
                        </span>
                        {isLeadDev && (
                          <span
                            title="Lead Developer Mode active on this browser"
                            className="text-[9px] px-1.5 py-0.5 rounded font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30"
                          >
                            👑 Lead Dev
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsOpen(false);
                      }}
                      className="size-6 rounded-full hover:bg-neutral-800 text-neutral-400 hover:text-white flex items-center justify-center transition-colors"
                      title="Close"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>

                  {/* Lead Developer Tab Switcher */}
                  {isLeadDev && (
                    <div className="grid grid-cols-2 p-0.5 bg-neutral-900/90 rounded-lg border border-neutral-800/80">
                      <button
                        type="button"
                        onClick={() => setDevTab("page")}
                        className={`py-1 text-[11px] font-medium rounded-md transition-colors flex items-center justify-center gap-1.5 ${
                          devTab === "page"
                            ? "bg-neutral-800 text-white shadow-sm"
                            : "text-neutral-400 hover:text-neutral-200"
                        }`}
                      >
                        <MapPin className="size-3 text-amber-400" />
                        <span>This Page ({pins.length})</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setDevTab("all")}
                        className={`py-1 text-[11px] font-medium rounded-md transition-colors flex items-center justify-center gap-1.5 ${
                          devTab === "all"
                            ? "bg-neutral-800 text-white shadow-sm"
                            : "text-neutral-400 hover:text-neutral-200"
                        }`}
                      >
                        <Globe className="size-3 text-blue-400" />
                        <span>All Pins ({allPins.length})</span>
                      </button>
                    </div>
                  )}

                  {/* TAB 1: This Page View (Standard View) */}
                  {(!isLeadDev || devTab === "page") && (
                    <>
                      {/* Status Bar */}
                      <div className="bg-neutral-900/90 rounded-lg px-2.5 py-2 border border-neutral-800/80 flex items-center justify-between gap-2">
                        <span className="text-[11px] text-emerald-400 font-medium shrink-0">
                          {pinsLoading
                            ? "Loading…"
                            : pins.length === 0
                            ? "No pins yet"
                            : `${pins.length} pin${pins.length !== 1 ? "s" : ""} on this page`}
                        </span>
                        <span className="font-mono text-[10px] text-neutral-500 truncate text-right max-w-[120px]">
                          {pageDisplayPath}
                        </span>
                      </div>

                      {/* Action Buttons */}
                      <div className="grid grid-cols-2 gap-2">
                        {/* Add Pin */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setIsOpen(false);
                            setPlacingPin(true);
                          }}
                          className="flex flex-col items-center justify-center gap-1.5 py-3 px-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-neutral-100 transition-all text-[11px] font-medium"
                        >
                          <Pin className="size-4 text-amber-400" />
                          Add pin
                        </button>

                        {/* Show / Hide Pins */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setPinsVisible((v) => !v);
                          }}
                          className={`flex flex-col items-center justify-center gap-1.5 py-3 px-2 rounded-lg border transition-all text-[11px] font-medium ${
                            pinsVisible
                              ? "bg-neutral-800 hover:bg-neutral-700 border-neutral-700 text-neutral-100"
                              : "bg-neutral-900 hover:bg-neutral-800 border-neutral-800 text-neutral-400"
                          }`}
                        >
                          {pinsVisible ? (
                            <EyeOff className="size-4 text-blue-400" />
                          ) : (
                            <Eye className="size-4 text-blue-400" />
                          )}
                          {pinsVisible ? "Hide pins" : "Show pins"}
                        </button>
                      </div>

                      {/* Pin List (compact, scrollable) */}
                      {pins.length > 0 && (
                        <div className="space-y-1">
                          <span className="text-[10px] uppercase tracking-wider text-neutral-500 font-semibold">
                            Pins on this page
                          </span>
                          <div
                            className="overflow-y-auto space-y-0.5 pr-0.5"
                            style={{ maxHeight: 160 }}
                          >
                            {pins.map((pin, i) => {
                              const isLocationUnavailable =
                                pin.anchorLost ||
                                Boolean(pin.elementSelector && !resolveElement(pin.elementSelector).found);
                              return (
                                <button
                                  key={pin._id}
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setActivePopoverPin(pin);
                                    setIsOpen(false);
                                  }}
                                  className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-md bg-neutral-900 hover:bg-neutral-800 border border-neutral-800/60 text-left transition-colors"
                                >
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span className="text-[10px] font-mono text-neutral-500 shrink-0 w-4 text-center">
                                      {i + 1}
                                    </span>
                                    <span className="text-[11px] text-neutral-300 truncate">
                                      {pin.description}
                                    </span>
                                  </div>
                                  {pin.status === "resolved" && <span title={`Resolved by ${pin.resolvedByName || "Unknown reviewer"}`} className="shrink-0 rounded border border-emerald-800/60 bg-emerald-950/60 px-1 py-0.5 text-[9px] font-medium text-emerald-300">Resolved</span>}
                                  {isLocationUnavailable && (
                                    <span className="text-[9px] font-medium text-amber-400 bg-amber-950/60 border border-amber-800/60 px-1 py-0.5 rounded shrink-0">
                                      Location unavailable
                                    </span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  {/* TAB 2: All Pins Feed (Lead Developer Only) */}
                  {isLeadDev && devTab === "all" && (
                    <div className="space-y-2">
                      {/* Sub-filters */}
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setFilterStatus("all")}
                          className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                            filterStatus === "all"
                              ? "bg-neutral-700 text-white"
                              : "bg-neutral-900 text-neutral-400 hover:text-neutral-200"
                          }`}
                        >
                          All ({allPins.length})
                        </button>
                        <button
                          type="button"
                          onClick={() => setFilterStatus("open")}
                          className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                            filterStatus === "open"
                              ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                              : "bg-neutral-900 text-neutral-400 hover:text-neutral-200"
                          }`}
                        >
                          Open ({unresolvedAllCount})
                        </button>
                        <button
                          type="button"
                          onClick={() => setFilterStatus("resolved")}
                          className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                            filterStatus === "resolved"
                              ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                              : "bg-neutral-900 text-neutral-400 hover:text-neutral-200"
                          }`}
                        >
                          Resolved ({allPins.length - unresolvedAllCount})
                        </button>
                      </div>

                      {/* Pins list across all pages */}
                      <div
                        className="overflow-y-auto space-y-1.5 pr-0.5"
                        style={{ maxHeight: 220 }}
                      >
                        {allPinsLoading ? (
                          <div className="py-8 text-center text-neutral-500 text-[11px]">
                            Loading all website pins…
                          </div>
                        ) : allPins.length === 0 ? (
                          <div className="py-8 text-center text-neutral-500 text-[11px]">
                            No review pins placed yet on any page.
                          </div>
                        ) : (
                          allPins
                            .filter((p) => {
                              if (filterStatus === "open") return p.status !== "resolved";
                              if (filterStatus === "resolved") return p.status === "resolved";
                              return true;
                            })
                            .map((pin) => {
                              const isCurrentPage = pin.page === pathname;
                              return (
                                <div
                                  key={pin._id}
                                  onClick={() => handleJumpToPin(pin)}
                                  className="group cursor-pointer p-2 rounded-lg bg-neutral-900/90 hover:bg-neutral-800 border border-neutral-800/80 hover:border-neutral-700 transition-all text-left"
                                >
                                  <div className="flex items-center justify-between gap-1.5 mb-1">
                                    <span
                                      title={pin.page}
                                      className="font-mono text-[9px] px-1.5 py-0.5 rounded bg-blue-950/70 border border-blue-800/50 text-blue-300 truncate max-w-[160px]"
                                    >
                                      {pin.page}
                                    </span>
                                    <div className="flex items-center gap-1 shrink-0">
                                      {pin.status === "resolved" ? (
                                        <span className="text-[9px] px-1 py-0.2 rounded bg-emerald-950/60 text-emerald-300 border border-emerald-800/50 flex items-center gap-0.5">
                                          <CheckCircle2 className="size-2.5" />
                                          Resolved
                                        </span>
                                      ) : (
                                        <span className="text-[9px] px-1 py-0.2 rounded bg-amber-950/60 text-amber-300 border border-amber-800/50">
                                          Open
                                        </span>
                                      )}
                                    </div>
                                  </div>

                                  <p className="text-[11px] text-neutral-200 line-clamp-2 leading-relaxed">
                                    {pin.description}
                                  </p>

                                  <div className="mt-1.5 flex items-center justify-between text-[10px] text-neutral-500 pt-1 border-t border-neutral-800/50">
                                    <span className="truncate">
                                      By <strong className="text-neutral-400 font-medium">{pin.testerName}</strong>
                                    </span>
                                    <span className="flex items-center gap-0.5 text-blue-400 group-hover:underline font-medium">
                                      {isCurrentPage ? "Jump on page" : "Go to page"}
                                      <ExternalLink className="size-2.5" />
                                    </span>
                                  </div>
                                </div>
                              );
                            })
                        )}
                      </div>
                    </div>
                  )}

                  {/* Drag Handle & Tour footer */}
                  <div className="pt-2 flex items-center justify-between text-[10px] text-neutral-500 border-t border-neutral-800/60">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsOpen(false);
                        startReviewPinsTour(true);
                      }}
                      className="flex items-center gap-1 text-neutral-400 hover:text-emerald-400 transition-colors"
                      title="Replay Driver.js Tour"
                    >
                      <HelpCircle className="size-3" />
                      <span>How to use</span>
                    </button>
                    <div className="flex items-center gap-1 cursor-grab active:cursor-grabbing">
                      <GripHorizontal className="size-3 opacity-60" />
                      <span>Drag to move</span>
                    </div>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Trigger Button with Brand Logo */}
          <button
            id="review-pins-gooey-trigger"
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (hasDragged.current) return;
              setIsOpen((prev) => !prev);
            }}
            className={`skiper46-trigger flex size-12 cursor-pointer items-center justify-center rounded-full relative z-10 outline-none focus:outline-none transition-all ${
              placingPin
                ? "ring-2 ring-amber-400 ring-offset-1 ring-offset-black"
                : ""
            }`}
            title="Review Pins"
          >
            <img
              src={brandLogo}
              alt={brandName}
              className="size-7 object-contain drop-shadow"
            />

            {/* Unresolved pins counter badge for Lead Developer */}
            {isLeadDev && unresolvedAllCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-amber-500 text-neutral-950 font-bold text-[10px] flex items-center justify-center shadow-lg border-2 border-black pointer-events-none">
                {unresolvedAllCount > 99 ? "99+" : unresolvedAllCount}
              </span>
            )}

            {/* Placement-active pulsing ring */}
            {placingPin && (
              <span className="absolute inset-0 rounded-full border-2 border-amber-400 animate-ping opacity-60 pointer-events-none" />
            )}
          </button>
        </div>
      </motion.div>
    </>
  );
}
