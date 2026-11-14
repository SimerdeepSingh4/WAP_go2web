import test from "node:test";
import assert from "node:assert/strict";
import { radialIndexAtPoint } from "./radial-menu.geometry.js";

test("pointer direction selects a segment even far outside the ring", () => {
  assert.equal(radialIndexAtPoint(400, 0, 400, 400, 4, 40), 0);
  assert.equal(radialIndexAtPoint(4000, 400, 400, 400, 4, 40), 1);
  assert.equal(radialIndexAtPoint(400, 4000, 400, 400, 4, 40), 2);
  assert.equal(radialIndexAtPoint(-4000, 400, 400, 400, 4, 40), 3);
  assert.equal(radialIndexAtPoint(402, 398, 400, 400, 4, 40), null);
});
test("direction tracking wraps correctly for both role-specific menus", () => {
  for (const total of [6, 7]) for (let index = 0; index < total; index++) {
    const radians = (-90 + index * 360 / total) * Math.PI / 180;
    assert.equal(radialIndexAtPoint(Math.cos(radians) * 2000, Math.sin(radians) * 2000, 0, 0, total, 40), index);
  }
});
