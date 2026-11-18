import { driver } from "driver.js";
import "driver.js/dist/driver.css";
import "./reviewPinsTour.css";

const TOUR_STORAGE_KEY = "review_pins_tour_completed";

export function isTourCompleted() {
  if (typeof window === "undefined") return true;
  try {
    return localStorage.getItem(TOUR_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function resetReviewPinsTour() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(TOUR_STORAGE_KEY);
  } catch {
    // ignore
  }
}

let activeDriver = null;

export function startReviewPinsTour(force = false) {
  if (typeof window === "undefined") return;

  if (!force && isTourCompleted()) {
    return;
  }

  // Ensure any previous driver instance is cleared
  if (activeDriver) {
    try {
      activeDriver.destroy();
    } catch {
      // ignore
    }
    activeDriver = null;
  }

  // Verify the target element exists in DOM before starting
  const targetSelector = "#review-pins-gooey-trigger";
  const el = document.querySelector(targetSelector);
  if (!el) {
    // Retry shortly if the component is still animating/mounting
    setTimeout(() => {
      const retryEl = document.querySelector(targetSelector);
      if (retryEl) {
        startReviewPinsTour(force);
      }
    }, 400);
    return;
  }

  const driverObj = driver({
    showProgress: true,
    animate: true,
    allowClose: true,
    overlayColor: "rgba(0, 0, 0, 0.72)",
    popoverClass: "review-pins-driver-popover",
    nextBtnText: "Next →",
    prevBtnText: "Back",
    doneBtnText: "Got it!",
    onDestroyStarted: () => {
      try {
        localStorage.setItem(TOUR_STORAGE_KEY, "true");
      } catch {
        // ignore
      }
      driverObj.destroy();
      activeDriver = null;
    },
    steps: [
      {
        element: targetSelector,
        popover: {
          title: "📍 Found a Mistake or Improvement?",
          description:
            "Use this button anytime you spot a bug, design flaw, alignment issue, or have a suggestion to improve any page on the website.",
          side: "left",
          align: "end",
        },
      },
      {
        element: targetSelector,
        popover: {
          title: "🎯 Point, Click & Pin It",
          description:
            'Click the button, choose "Add pin", then click directly on the faulty element on your screen to attach your note. Our developers track every pin in real-time!',
          side: "left",
          align: "end",
        },
      },
    ],
  });

  activeDriver = driverObj;
  driverObj.drive();
}
