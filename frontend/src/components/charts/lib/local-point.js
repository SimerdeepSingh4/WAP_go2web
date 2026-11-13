function isElement(value) {
  return typeof Element !== "undefined" && value instanceof Element;
}

function isEvent(value) {
  if (typeof Event === "undefined" || !value) {
    return false;
  }
  return (value instanceof Event || ("nativeEvent" in (value) && (value).nativeEvent instanceof Event));
}

function clientCoords(event) {
  if ("changedTouches" in event) {
    const touch = event.changedTouches[0];
    return touch ? { x: touch.clientX, y: touch.clientY } : { x: 0, y: 0 };
  }
  if ("clientX" in event) {
    return { x: event.clientX, y: event.clientY };
  }
  // Focus (and other coordinate-less) events: centre of the target.
  const target = (event).target;
  if (
    target &&
    typeof target === "object" &&
    "getBoundingClientRect" in target
  ) {
    const rect = (target).getBoundingClientRect();
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  }
  return { x: 0, y: 0 };
}

function localPointFromNode(node, event) {
  const coords = clientCoords(event);

  // Top-most SVG (null for the outermost <svg> itself -> rect fallback).
  const svg =
    (typeof SVGElement !== "undefined" && node instanceof SVGElement) ||
    "ownerSVGElement" in node
      ? (node).ownerSVGElement
      : node;
  const screenCTM =
    svg && "getScreenCTM" in svg
      ? (svg).getScreenCTM()
      : null;

  if (svg && "createSVGPoint" in svg && screenCTM) {
    const point = (svg).createSVGPoint();
    point.x = coords.x;
    point.y = coords.y;
    const local = point.matrixTransform(screenCTM.inverse());
    return { x: local.x, y: local.y };
  }

  const rect = node.getBoundingClientRect();
  return {
    x: coords.x - rect.left - node.clientLeft,
    y: coords.y - rect.top - node.clientTop,
  };
}

export function localPoint(nodeOrEvent, maybeEvent) {
  if (isElement(nodeOrEvent) && maybeEvent) {
    return localPointFromNode(nodeOrEvent, maybeEvent);
  }
  if (isEvent(nodeOrEvent)) {
    const node = nodeOrEvent.target;
    if (isElement(node)) {
      return localPointFromNode(node, nodeOrEvent);
    }
  }
  return null;
}
