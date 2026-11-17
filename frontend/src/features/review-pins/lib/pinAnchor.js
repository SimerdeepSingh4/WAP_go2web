/**
 * pinAnchor.js — DOM utility helpers for Review Pins anchor computation.
 */

/**
 * Generate a stable CSS selector for a DOM element.
 * Prefers data-review-id attribute; falls back to tag+nth-child path walking up to 4 ancestors.
 * @param {Element} el
 * @returns {string}
 */
export function getStableSelector(el) {
  if (!el || el === document.body || el === document.documentElement) {
    return "body";
  }

  // Prefer explicit review ID
  if (el.dataset && el.dataset.reviewId) {
    return `[data-review-id="${el.dataset.reviewId}"]`;
  }

  // Build a path of up to 4 ancestors
  const parts = [];
  let current = el;
  let depth = 0;

  while (current && current !== document.body && depth < 4) {
    let segment = current.tagName.toLowerCase();

    // Use id if unique in document
    if (current.id && document.querySelectorAll(`#${CSS.escape(current.id)}`).length === 1) {
      segment = `#${CSS.escape(current.id)}`;
      parts.unshift(segment);
      break; // id is globally unique, stop walking
    }

    // Add a distinguishing class if present and unique enough among siblings
    const relevantClass = Array.from(current.classList).find(
      (c) => c && !c.match(/^(active|hover|focus|selected|open|closed|hidden|visible)$/)
    );
    if (relevantClass) {
      segment += `.${CSS.escape(relevantClass)}`;
    }

    // Add nth-child to disambiguate siblings
    const parent = current.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter(
        (s) => s.tagName === current.tagName
      );
      if (siblings.length > 1) {
        const index = siblings.indexOf(current) + 1;
        segment += `:nth-of-type(${index})`;
      }
    }

    parts.unshift(segment);
    current = current.parentElement;
    depth++;
  }

  return parts.join(" > ");
}

/**
 * Given a saved CSS selector, find the matching DOM element.
 * @param {string} selector
 * @returns {{ el: Element|null, found: boolean }}
 */
export function resolveElement(selector) {
  if (!selector) return { el: null, found: false };
  try {
    const el = document.querySelector(selector);
    return { el, found: !!el };
  } catch {
    return { el: null, found: false };
  }
}

/**
 * Given a mouse event and an element, compute relX/relY (0–1) within the element's bounding rect.
 * @param {Element} el
 * @param {number} clientX
 * @param {number} clientY
 * @returns {{ relX: number, relY: number }}
 */
export function getRelativePosition(el, clientX, clientY) {
  const rect = el.getBoundingClientRect();
  const relX = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  const relY = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
  return { relX, relY };
}

/**
 * Given a saved pin, compute absolute { left, top } page coordinates for the marker.
 * Snaps the numbered badge to the nearest edge of the anchored element.
 * Includes the element bounds so its highlight follows the same geometry.
 * Falls back to pageRelX * innerWidth / pageRelY * scrollHeight if element is lost.
 * Returns null if neither method can produce a position.
 * @param {{ elementSelector: string, elementRelX: number, elementRelY: number, pageRelX: number, pageRelY: number }} pin
 * @returns {{ left: number, top: number, region?: object, anchorLost: boolean }|null}
 */
function pinVisibility(el, rect, marker) {
  const bounds = { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
  // Portalled annotations must respect the same clipping as their target.
  for (let parent = el.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
    const style = window.getComputedStyle(parent);
    const clipsX = /^(auto|scroll|hidden|clip)$/.test(style.overflowX);
    const clipsY = /^(auto|scroll|hidden|clip)$/.test(style.overflowY);
    if (!clipsX && !clipsY) continue;
    const parentRect = parent.getBoundingClientRect();
    if (clipsX) {
      bounds.left = Math.max(bounds.left, parentRect.left + parent.clientLeft);
      bounds.right = Math.min(bounds.right, parentRect.left + parent.clientLeft + parent.clientWidth);
    }
    if (clipsY) {
      bounds.top = Math.max(bounds.top, parentRect.top + parent.clientTop);
      bounds.bottom = Math.min(bounds.bottom, parentRect.top + parent.clientTop + parent.clientHeight);
    }
  }
  const workspace = el.closest(".portal-main");
  if (workspace) {
    const workspaceRect = workspace.getBoundingClientRect();
    bounds.left = Math.max(bounds.left, workspaceRect.left);
    bounds.right = Math.min(bounds.right, workspaceRect.right);
    const header = workspace.closest(".portal-inset")?.querySelector(".portal-topbar");
    if (header) bounds.top = Math.max(bounds.top, header.getBoundingClientRect().bottom);
  }
  const visible = rect.right > bounds.left && rect.left < bounds.right &&
    rect.bottom > bounds.top && rect.top < bounds.bottom;
  const radius = 13;
  return {
    visible,
    // Keep the original border geometry; clipping must never move the anchor.
    clipPath: `inset(${Math.max(0, bounds.top - rect.top)}px ${Math.max(0, rect.right - bounds.right)}px ${Math.max(0, rect.bottom - bounds.bottom)}px ${Math.max(0, bounds.left - rect.left)}px)`,
    markerVisible: visible &&
      marker.left - window.scrollX - radius >= bounds.left &&
      marker.left - window.scrollX + radius <= bounds.right &&
      marker.top - window.scrollY - radius >= bounds.top &&
      marker.top - window.scrollY + radius <= bounds.bottom,
  };
}

export function computeMarkerPosition(pin) {
  if (!pin) return null;

  const { elementSelector, elementRelX, elementRelY, pageRelX, pageRelY } = pin;

  // Try resolving the anchored element
  if (elementSelector) {
    const { el, found } = resolveElement(elementSelector);
    if (found && el) {
      if (!el.getClientRects().length) return null;
      const rect = el.getBoundingClientRect();
      if (!rect.width || !rect.height) return null;
      const relX = Math.max(0, Math.min(1, elementRelX ?? 0.5));
      const relY = Math.max(0, Math.min(1, elementRelY ?? 0.5));
      const region = {
        left: rect.left + window.scrollX,
        top: rect.top + window.scrollY,
        width: rect.width,
        height: rect.height,
        borderRadius: window.getComputedStyle(el).borderRadius,
      };
      const edges = [
        { distance: relY * rect.height, left: relX * rect.width, top: 0 },
        { distance: (1 - relY) * rect.height, left: relX * rect.width, top: rect.height },
        { distance: relX * rect.width, left: 0, top: relY * rect.height },
        { distance: (1 - relX) * rect.width, left: rect.width, top: relY * rect.height },
      ];
      const nearest = edges.reduce((best, edge) => edge.distance < best.distance ? edge : best);
      const marker = { left: region.left + nearest.left, top: region.top + nearest.top };
      return {
        ...marker,
        region,
        ...pinVisibility(el, rect, marker),
        anchorLost: Boolean(pin.anchorLost),
      };
    }
  }

  // Fallback: page-relative coordinates
  if (pageRelX != null && pageRelY != null) {
    const left = pageRelX * window.innerWidth;
    const top = pageRelY * document.documentElement.scrollHeight;
    return { left, top, anchorLost: true };
  }

  return null;
}

/**
 * Given placement information (el, clientX, clientY), compute anchor payload.
 * @param {{ el: Element|null, clientX: number, clientY: number }} param0
 * @returns {{ elementSelector: string|null, elementRelX: number, elementRelY: number, pageRelX: number, pageRelY: number }}
 */
export function computeAnchor({ el, clientX, clientY }) {
  const elementSelector = el ? getStableSelector(el) : null;
  const { relX: elementRelX, relY: elementRelY } = el
    ? getRelativePosition(el, clientX, clientY)
    : { relX: 0.5, relY: 0.5 };
  const pageRelX = window.innerWidth > 0 ? (clientX + window.scrollX) / window.innerWidth : 0;
  const pageRelY =
    document.documentElement.scrollHeight > 0
      ? (clientY + window.scrollY) / document.documentElement.scrollHeight
      : 0;

  return {
    elementSelector,
    elementRelX,
    elementRelY,
    pageRelX,
    pageRelY,
  };
}
