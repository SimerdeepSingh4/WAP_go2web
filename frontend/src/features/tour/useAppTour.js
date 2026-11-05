import { useEffect, useRef, useCallback } from "react";
import { driver } from "driver.js";
import "./tour.css";
import { hasSeenTour, markTourSeen } from "./tourStorage";
import { adminTourSteps } from "./adminTourSteps";

const stepsByRole = {
  "Super Admin": adminTourSteps,
  // User and Reseller steps will be connected in Step 2 & Step 3
  User: [],
  Reseller: [],
};

export function useAppTour(role, userId) {
  const driverInstanceRef = useRef(null);

  const startTour = useCallback((force = false) => {
    const rawSteps = stepsByRole[role];
    if (!rawSteps || rawSteps.length === 0) return;

    // Filter steps to those that exist in DOM or are modal/center popovers
    const validSteps = rawSteps.filter((step) => {
      if (!step.element) return true;
      return Boolean(document.querySelector(step.element));
    });

    if (validSteps.length === 0) return;

    // Destroy existing instance if active
    if (driverInstanceRef.current) {
      try {
        driverInstanceRef.current.destroy();
      } catch (_) {}
    }

    const driverObj = driver({
      showProgress: true,
      animate: true,
      allowClose: true,
      overlayColor: "rgba(15, 23, 42, 0.65)",
      nextBtnText: "Next →",
      prevBtnText: "← Back",
      doneBtnText: "Got it! 🎉",
      steps: validSteps,
      onDestroyStarted: () => {
        markTourSeen(role, userId);
        driverObj.destroy();
      },
    });

    driverInstanceRef.current = driverObj;
    driverObj.drive();
  }, [role, userId]);

  useEffect(() => {
    if (!role) return;

    // Check if tour should run automatically (first time for this device or user)
    const alreadySeen = hasSeenTour(role, userId);
    if (!alreadySeen) {
      // Small timeout to allow DOM layout to render fully
      const timer = setTimeout(() => {
        startTour(false);
      }, 700);

      return () => clearTimeout(timer);
    }
  }, [role, userId, startTour]);

  return { startTour };
}
