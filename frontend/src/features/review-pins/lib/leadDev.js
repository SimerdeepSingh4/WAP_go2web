import { useState, useEffect, useCallback } from "react";
import { toast } from "@/components/ui/toast";

const STORAGE_KEY = "review_lead_dev";
const EVENT_NAME = "lead-dev-changed";

export function isLeadDevActive() {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function setLeadDevActive(active) {
  if (typeof window === "undefined") return;
  try {
    if (active) {
      localStorage.setItem(STORAGE_KEY, "true");
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { active } }));
  } catch {
    // Ignore localStorage errors
  }
}

/**
 * Checks for secret query params in the current URL:
 *   ?devKey=lead2026 (or any secret) -> unlocks Lead Developer mode
 *   ?devKey=off -> locks / deactivates Lead Developer mode
 * Supports ?devKey=..., ?leadDev=..., ?dev=...
 * Cleans the query param from the browser address bar immediately so it remains hidden.
 */
export function checkSecretUrlParams() {
  if (typeof window === "undefined") return;
  try {
    const url = new URL(window.location.href);
    const devParam =
      url.searchParams.get("devKey") ||
      url.searchParams.get("leadDev") ||
      url.searchParams.get("dev");

    if (devParam !== null) {
      const lower = devParam.trim().toLowerCase();
      const shouldDeactivate = lower === "off" || lower === "false" || lower === "0";

      // Clean the query parameters from URL silently without reloading
      url.searchParams.delete("devKey");
      url.searchParams.delete("leadDev");
      url.searchParams.delete("dev");
      const cleanUrl = url.pathname + (url.search ? url.search : "") + url.hash;
      window.history.replaceState({}, document.title, cleanUrl);

      if (shouldDeactivate) {
        setLeadDevActive(false);
        toast.add({
          title: "Developer mode disabled",
          description: "Global pin tracking deactivated on this browser.",
          type: "info",
        });
      } else {
        setLeadDevActive(true);
        toast.add({
          title: "👑 Lead Developer Mode active",
          description: "Tracking all pins across the entire website.",
          type: "success",
        });
      }
    }
  } catch {
    // Ignore URL parsing errors
  }
}

/**
 * Hook to read and subscribe to Lead Developer status.
 * Also binds keyboard shortcut Ctrl + Alt + D to toggle stealthily.
 */
export function useLeadDev() {
  const [isLeadDev, setIsLeadDev] = useState(() => isLeadDevActive());

  const handleToggle = useCallback((next) => {
    const target = typeof next === "boolean" ? next : !isLeadDevActive();
    setLeadDevActive(target);
    setIsLeadDev(target);
    toast.add({
      title: target ? "👑 Lead Developer Mode activated" : "Developer mode deactivated",
      type: target ? "success" : "info",
    });
  }, []);

  useEffect(() => {
    // Check URL parameters on mount
    checkSecretUrlParams();
    setIsLeadDev(isLeadDevActive());

    function onStorageOrCustom(e) {
      if (e.type === EVENT_NAME) {
        setIsLeadDev(Boolean(e.detail?.active));
      } else if (e.key === STORAGE_KEY) {
        setIsLeadDev(e.newValue === "true");
      }
    }

    // Stealth keyboard shortcut: Ctrl + Alt + D
    function onKeyDown(e) {
      if ((e.ctrlKey || e.metaKey) && e.altKey && (e.key === "d" || e.key === "D")) {
        e.preventDefault();
        handleToggle();
      }
    }

    window.addEventListener(EVENT_NAME, onStorageOrCustom);
    window.addEventListener("storage", onStorageOrCustom);
    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener(EVENT_NAME, onStorageOrCustom);
      window.removeEventListener("storage", onStorageOrCustom);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [handleToggle]);

  return { isLeadDev, toggleLeadDev: handleToggle };
}
