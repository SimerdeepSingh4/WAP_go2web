import test from "node:test";
import assert from "node:assert/strict";
import { adminPageTours, getAdminPageTour } from "./adminTourSteps.js";
import { userPageTours, getUserPageTour } from "./userTourSteps.js";
import { resellerPageTours, getResellerPageTour } from "./resellerTourSteps.js";
import { getPageTour, getTourSteps } from "./appTourSteps.js";
import { getTourKey, getTourStatus, setTourStatus, isTourDismissed } from "./tourStorage.js";

test("each supported admin page resolves to its own guide", () => {
  const paths = {
    "/admin": "overview", "/admin/campaigns": "campaigns",
    "/admin/resellers": "resellers",
    "/admin/users": "users", "/admin/credits": "credits", "/admin/activity": "activity",
    "/admin/settings": "settings",
    "/admin/campaigns/123": "campaign-detail",
    "/admin/campaigns/123/report": "campaign-report",
    "/admin/campaigns/123/report/create": "campaign-report-create",
  };
  for (const [path, id] of Object.entries(paths)) {
    assert.equal(getAdminPageTour(path)?.id, id, path);
    assert.equal(getAdminPageTour(`${path}/`)?.id, id, `${path}/`);
  }
  assert.equal(new Set(Object.values(paths)).size, Object.keys(paths).length);
});

test("campaign guides share progress across IDs but separate detail, editing, and review", () => {
  assert.equal(getAdminPageTour("/admin/campaigns/first"), getAdminPageTour("/admin/campaigns/second"));
  assert.notEqual(getAdminPageTour("/admin/campaigns/first/report"), getAdminPageTour("/admin/campaigns/first/report/create"));
});

test("each supported user page has its own guide", () => {
  const paths = {
    "/user": "overview", "/user/campaigns": "campaigns",
    "/user/campaigns/create": "campaign-create", "/user/campaigns/new": "campaign-create",
    "/user/campaigns/123": "campaign-detail", "/user/campaigns/123/report": "campaign-report",
    "/user/credits": "credits",
  };
  for (const [path, id] of Object.entries(paths)) {
    assert.equal(getUserPageTour(path)?.id, id, path);
    assert.equal(getUserPageTour(`${path}/`)?.id, id, `${path}/`);
    assert.equal(getPageTour("User", path), getUserPageTour(path));
  }
});

test("user creation aliases share a guide and campaign IDs share page progress", () => {
  assert.equal(getUserPageTour("/user/campaigns/new"), getUserPageTour("/user/campaigns/create"));
  assert.equal(getUserPageTour("/user/campaigns/first"), getUserPageTour("/user/campaigns/second"));
  assert.equal(getUserPageTour("/user/campaigns/first/report"), getUserPageTour("/user/campaigns/second/report"));
  assert.notEqual(getUserPageTour("/user/campaigns/create"), getUserPageTour("/user/campaigns/123"));
});

test("each supported reseller page has its own guide", () => {
  const paths = {
    "/reseller": "overview", "/reseller/users": "users", "/reseller/credits": "credits",
    "/reseller/campaigns": "campaigns", "/reseller/campaigns/create": "campaign-create",
    "/reseller/campaigns/new": "campaign-create", "/reseller/campaigns/123": "campaign-detail",
    "/reseller/campaigns/123/report": "campaign-report",
  };
  for (const [path, id] of Object.entries(paths)) {
    assert.equal(getResellerPageTour(path)?.id, id, path);
    assert.equal(getResellerPageTour(`${path}/`)?.id, id, `${path}/`);
    assert.equal(getPageTour("Reseller", path), getResellerPageTour(path));
  }
});

test("reseller settings and notifications have no guide and roles stay separate", () => {
  for (const path of ["/reseller/settings", "/reseller/settings/", "/reseller/notifications", "/reseller/notifications/", "/reseller/activity", "/reseller/unknown", "/reseller/campaigns/123/report/create", "/admin", "/user"]) {
    assert.equal(getResellerPageTour(path), null, path);
    assert.equal(getPageTour("Reseller", path), null, path);
  }
  assert.equal(getPageTour("User", "/reseller"), null);
  assert.equal(getPageTour("Super Admin", "/reseller"), null);
});

test("reseller campaign aliases and IDs share the correct guide", () => {
  assert.equal(getResellerPageTour("/reseller/campaigns/new"), getResellerPageTour("/reseller/campaigns/create"));
  assert.equal(getResellerPageTour("/reseller/campaigns/first"), getResellerPageTour("/reseller/campaigns/second"));
  assert.equal(getResellerPageTour("/reseller/campaigns/first/report"), getResellerPageTour("/reseller/campaigns/second/report"));
  assert.notEqual(getResellerPageTour("/reseller/campaigns/create"), getResellerPageTour("/reseller/campaigns/123"));
});

test("tour selection respects the workspace role and excludes unsupported pages", () => {
  for (const path of ["/admin", "/user/unknown", "/user/campaigns/123/report/create", "/user/activity", "/user/settings", "/user/settings/", "/user/notifications", "/user/notifications/", "/login"]) {
    assert.equal(getUserPageTour(path), null, path);
  }
  assert.equal(getPageTour("User", "/admin"), null);
  assert.equal(getPageTour("Super Admin", "/user"), null);
  assert.equal(getPageTour("Reseller", "/user"), null);
  assert.equal(getPageTour("Super Admin", "/admin/administrators"), null);
  assert.equal(getPageTour("Super Admin", "/admin/notifications"), null);
  assert.equal(getPageTour("User", "/user/settings"), null);
  assert.equal(getPageTour("User", "/user/notifications"), null);
  assert.equal(getPageTour("Super Admin", "/admin"), adminPageTours.overview);
});

test("unsupported pages do not accidentally run an admin tour", () => {
  for (const path of ["/user", "/reseller/campaigns", "/login", "/admin/administrators", "/admin/administrators/", "/admin/notifications", "/admin/notifications/", "/admin/unknown", "/admin/campaigns/123/unknown"]) {
    assert.equal(getAdminPageTour(path), null, path);
  }
});

test("each page guide has an introduction, feature explanations, and replay guidance", () => {
  for (const tour of [...Object.values(adminPageTours), ...Object.values(userPageTours), ...Object.values(resellerPageTours)]) {
    const steps = getTourSteps(tour);
    assert.equal(steps[0].element, undefined);
    assert.equal(steps[0].popover.title, tour.title);
    assert.equal(steps.at(-1).element, "#tour-help-button");
    assert.ok(tour.steps.length >= 2, tour.id);
    for (const step of steps) {
      assert.ok(step.popover.title);
      assert.ok(step.popover.description.length > 30);
    }
  }
});

test("tour keys isolate pages, roles, users, and the new version", () => {
  assert.equal(getTourKey("Super Admin", "a", "credits"), "super-admin-tour:v2:a:credits");
  assert.notEqual(getTourKey("Super Admin", "a", "credits"), getTourKey("Super Admin", "a", "overview"));
  assert.notEqual(getTourKey("Super Admin", "a"), getTourKey("Super Admin", "b"));
  assert.notEqual(getTourKey("User", "a"), getTourKey("Super Admin", "a"));
  assert.notEqual(getTourKey("Reseller", "a"), getTourKey("Super Admin", "a"));
  assert.notEqual(getTourKey("Reseller", "a"), getTourKey("User", "a"));
});

test("completed and skipped pages persist independently and can be reset", () => {
  const values = new Map();
  globalThis.window = { localStorage: {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  } };
  try {
    setTourStatus("Super Admin", "a", "completed", "credits");
    setTourStatus("Super Admin", "a", "skipped", "users");
    assert.equal(getTourStatus("Super Admin", "a", "credits"), "completed");
    assert.equal(isTourDismissed("Super Admin", "a", "credits"), true);
    assert.equal(isTourDismissed("Super Admin", "a", "users"), true);
    assert.equal(isTourDismissed("Super Admin", "a", "overview"), false);
    assert.equal(isTourDismissed("Super Admin", "b", "credits"), false);
    assert.equal(isTourDismissed("User", "a", "credits"), false);
    setTourStatus("User", "a", "completed", "credits");
    assert.equal(isTourDismissed("User", "a", "credits"), true);
    assert.equal(isTourDismissed("User", "a", "campaigns"), false);
    assert.equal(isTourDismissed("Reseller", "a", "credits"), false);
    setTourStatus("Reseller", "a", "completed", "credits");
    assert.equal(isTourDismissed("Reseller", "a", "credits"), true);
    assert.equal(isTourDismissed("Reseller", "a", "campaigns"), false);
    setTourStatus("Super Admin", "a", null, "credits");
    assert.equal(isTourDismissed("Super Admin", "a", "credits"), false);
  } finally { delete globalThis.window; }
});

test("blocked browser storage cannot break the page or tour", () => {
  globalThis.window = {};
  Object.defineProperty(window, "localStorage", { get() { throw new Error("Storage blocked"); } });
  try {
    assert.equal(getTourStatus("Super Admin", "a", "credits"), null);
    assert.doesNotThrow(() => setTourStatus("Super Admin", "a", "skipped", "credits"));
  } finally { delete globalThis.window; }
  assert.equal(getTourStatus("Super Admin", "a"), null);
});
