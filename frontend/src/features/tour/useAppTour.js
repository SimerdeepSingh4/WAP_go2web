import { useEffect, useRef, useCallback } from "react";
import { useLocation } from "react-router";
import { driver } from "driver.js";
import "./tour.css";
import { isTourDismissed, setTourStatus } from "./tourStorage";
import { getPageTour, getTourSteps } from "./appTourSteps";

function visibleElement(selector) {
  return [...document.querySelectorAll(selector)].find((element) =>
    element.getClientRects().length > 0 && getComputedStyle(element).visibility !== "hidden"
  );
}

export function useAppTour(role, userId) {
  const { pathname } = useLocation();
  const tour = getPageTour(role, pathname);
  const instanceRef = useRef(null);
  const timerRef = useRef(null);
  const dismissedRef = useRef(new Set());

  const startTour = useCallback((force = true) => {
    if (!tour || !userId) return;
    const sessionKey = `${role}:${userId}:${tour.id}`;
    if (!force && (dismissedRef.current.has(sessionKey) || isTourDismissed(role, userId, tour.id))) return;
    window.clearTimeout(timerRef.current);
    instanceRef.current?.destroy();
    let attempts = 0;

    const launchWhenReady = () => {
      const main = document.getElementById("dashboard-main");
      const busy = main?.querySelector('[aria-label^="Loading"], .animate-pulse, [data-tour-loading="true"]');
      const dialog = document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"]');
      if (!main?.querySelector("h1") || busy || dialog) {
        if (++attempts < 100) timerRef.current = window.setTimeout(launchWhenReady, 150);
        return;
      }
      const steps = getTourSteps(tour).flatMap((step) => {
        if (!step.element) return [step];
        const element = visibleElement(step.element);
        return element ? [{ ...step, element }] : [];
      });
      let action = null;
      const instance = driver({
        steps,
        popoverClass: "app-tour",
        showProgress: true,
        progressText: "{{current}} of {{total}}",
        animate: !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
        overlayColor: "#0f172a",
        overlayOpacity: 0.55,
        overlayClickBehavior: "none",
        stagePadding: 6,
        stageRadius: 12,
        popoverOffset: 14,
        disableActiveInteraction: true,
        nextBtnText: "Next &rarr;",
        prevBtnText: "Back",
        doneBtnText: "Finish tour",
        onNextClick: () => {
          if (instance.isLastStep()) { action = "completed"; instance.destroy(); }
          else instance.moveNext();
        },
        onCloseClick: () => { action = "skipped"; instance.destroy(); },
        onPopoverRender: (popover) => {
          const index = instance.getActiveIndex() ?? 0;
          const label = document.createElement("div");
          label.className = "app-tour-label";
          label.textContent = `PAGE GUIDE / ${tour.title}`;
          popover.wrapper.prepend(label);
          const progress = document.createElement("div");
          progress.className = "app-tour-track";
          progress.setAttribute("aria-hidden", "true");
          const fill = document.createElement("span");
          fill.style.width = `${((index + 1) / steps.length) * 100}%`;
          progress.append(fill);
          popover.wrapper.append(progress);
          const skip = document.createElement("button");
          skip.type = "button";
          skip.className = "app-tour-skip";
          skip.textContent = "Skip tour";
          skip.onclick = () => { action = "skipped"; instance.destroy(); };
          popover.description.after(skip);
          popover.closeButton.setAttribute("aria-label", "Close page tour");
        },
        onDestroyStarted: (_element, _step, { reason }) => {
          if (reason === "escape") action = "skipped";
          instance.destroy();
        },
        onDestroyed: () => {
          if (action) {
            dismissedRef.current.add(sessionKey);
            setTourStatus(role, userId, action, tour.id);
          }
          if (instanceRef.current === instance) instanceRef.current = null;
        },
      });
      instanceRef.current = instance;
      instance.drive();
    };
    timerRef.current = window.setTimeout(launchWhenReady, 350);
  }, [role, userId, tour]);

  useEffect(() => {
    startTour(false);
    return () => {
      window.clearTimeout(timerRef.current);
      instanceRef.current?.destroy();
      instanceRef.current = null;
    };
  }, [pathname, startTour]);

  return { startTour, hasTour: Boolean(tour), tourTitle: tour?.title };
}
