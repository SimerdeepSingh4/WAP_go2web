import { getAdminPageTour } from "./adminTourSteps.js";
import { getUserPageTour } from "./userTourSteps.js";
import { getResellerPageTour } from "./resellerTourSteps.js";

export function getPageTour(role, pathname) {
  if (role === "Super Admin") return getAdminPageTour(pathname);
  if (role === "User") return getUserPageTour(pathname);
  if (role === "Reseller") return getResellerPageTour(pathname);
  return null;
}

export function getTourSteps(tour) {
  return [
    { popover: { title: tour.title, description: `${tour.description} Choose Next to look around, or Skip tour to close.` } },
    ...tour.steps,
    { element: "#tour-help-button", popover: {
      title: "See this guide again", description: "Choose Take a tour in the top bar whenever you want to see this page's guide again.",
      side: "left", align: "start",
    } },
  ];
}
