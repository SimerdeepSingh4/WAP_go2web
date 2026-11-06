import { useEffect, useRef, useCallback } from "react";
import { driver } from "driver.js";
import "./tour.css";
import { getTourStatus, setTourStatus } from "./tourStorage";
import { adminTourSteps } from "./adminTourSteps";

const stepsByRole = {
  "Super Admin": adminTourSteps,
  User: [],
  Reseller: [],
};

export function useAppTour(role, userId) {
  const driverInstanceRef = useRef(null);
  const userActionRef = useRef(null); // "completed" | "skipped" | null (closed halfway)

  const startTour = useCallback(
    (force = false) => {
      const rawSteps = stepsByRole[role];
      if (!rawSteps || rawSteps.length === 0) return;

      // Filter steps to those that exist in DOM or are modal/center popovers
      const validSteps = rawSteps.filter((step) => {
        if (!step.element) return true;
        return Boolean(document.querySelector(step.element));
      });

      if (validSteps.length === 0) return;

      // Reset action for this tour run
      userActionRef.current = null;

      // Destroy existing instance if active
      if (driverInstanceRef.current) {
        try {
          driverInstanceRef.current.destroy();
        } catch (_) {}
      }

      let driverObj = null;

      driverObj = driver({
        showProgress: true,
        animate: true,
        allowClose: true,
        overlayColor: "rgba(15, 23, 42, 0.65)",
        nextBtnText: "Next →",
        prevBtnText: "← Back",
        doneBtnText: "Finish 🎉",
        steps: validSteps,
        onPopoverRender: (popover) => {
          if (!popover || !popover.footer) return;

          // If on the last step, attach listener to the Finish button
          if (driverObj?.isLastStep?.()) {
            if (popover.nextBtn) {
              popover.nextBtn.onclick = () => {
                userActionRef.current = "completed";
                driverObj.destroy();
              };
            }
          } else {
            // If not the last step, add a clean "Skip tour" button to the footer
            let skipBtn = popover.footer.querySelector(".driver-popover-skip-btn");
            if (!skipBtn) {
              skipBtn = document.createElement("button");
              skipBtn.type = "button";
              skipBtn.className = "driver-popover-skip-btn";
              skipBtn.innerText = "Skip tour";
              skipBtn.onclick = () => {
                userActionRef.current = "skipped";
                driverObj.destroy();
              };
              // Insert skip button before the navigation buttons
              const navBtns = popover.footer.querySelector(".driver-popover-navigation-btns");
              if (navBtns) {
                popover.footer.insertBefore(skipBtn, navBtns);
              } else {
                popover.footer.appendChild(skipBtn);
              }
            }
          }
        },
        onDestroyStarted: () => {
          if (userActionRef.current === "completed") {
            setTourStatus(role, userId, "completed");
          } else if (userActionRef.current === "skipped") {
            setTourStatus(role, userId, "skipped");
          } else {
            // Closed halfway via X button, ESC key, or backdrop click.
            // Leave the key unset so they can try again on next login!
          }
          driverObj.destroy();
        },
      });

      driverInstanceRef.current = driverObj;
      driverObj.drive();
    },
    [role, userId]
  );

  useEffect(() => {
    if (!role || !userId) return;

    // Check versioned key: e.g. super-admin-tour:v1:${userId}
    const status = getTourStatus(role, userId);
    if (status !== null) {
      // Key already exists (either "completed" or "skipped") -> do not prompt
      return;
    }

    // Key is missing! Wait for the dashboard and target elements to be ready
    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 60; // up to 6 seconds (100ms interval)

    const checkReadyAndStart = () => {
      if (cancelled) return;
      attempts++;

      const isReady =
        Boolean(document.querySelector(".portal-metrics")) ||
        Boolean(document.querySelector(".portal-sidebar"));

      if (isReady) {
        // Small delay to ensure layout animations and data settle
        const timer = setTimeout(() => {
          if (!cancelled) {
            startTour(false);
          }
        }, 400);
        return () => clearTimeout(timer);
      } else if (attempts < maxAttempts) {
        setTimeout(checkReadyAndStart, 100);
      }
    };

    checkReadyAndStart();

    return () => {
      cancelled = true;
    };
  }, [role, userId, startTour]);

  return { startTour };
}
