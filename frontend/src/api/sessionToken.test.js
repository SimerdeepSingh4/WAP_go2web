import test from "node:test";
import assert from "node:assert/strict";
import { initializeSessionState, getSessionToken, getAccountContext, setImpersonationToken, clearCurrentSessionToken, leaveAccountContext, rememberVerifiedSession, getSessionRequestScope, isSessionRequestCurrent, invalidateSessionRequests, publishBrowserSessionChange, BROWSER_SESSION_KEY } from "./sessionToken.js";

class Storage {
    data = new Map();
    getItem(key) { return this.data.get(key) ?? null; }
    setItem(key, value) { this.data.set(key, String(value)); }
    removeItem(key) { this.data.delete(key); }
}
globalThis.sessionStorage = new Storage();
globalThis.localStorage = new Storage();

test("ordinary credentials in either browser storage are retired, never used for authentication", () => {
    sessionStorage.setItem("authToken", "old-user-token"); localStorage.setItem("token", "old-admin-token");
    assert.equal(getSessionToken(), null);
    initializeSessionState();
    assert.equal(sessionStorage.getItem("authToken"), null); assert.equal(localStorage.getItem("token"), null);
});

test("an explicit access token stays scoped to its tab and losing it retains a closed context", () => {
    setImpersonationToken("scoped-access-token");
    assert.equal(getAccountContext(), "impersonation"); assert.equal(getSessionToken(), "scoped-access-token");
    clearCurrentSessionToken();
    assert.equal(getSessionToken(), null); assert.equal(getAccountContext(), "impersonation");
    leaveAccountContext(); assert.equal(getAccountContext(), "");
});

test("a session transition discards old responses and browser sync contains no credentials", () => {
    rememberVerifiedSession({ id: "user-a", sessionId: "session-a" });
    const request = getSessionRequestScope();
    assert.equal(request.accountId, "user-a"); assert.equal(request.sessionId, "session-a");
    invalidateSessionRequests(); assert.equal(isSessionRequestCurrent(request), false);
    const next = getSessionRequestScope();
    publishBrowserSessionChange("login");
    assert.equal(isSessionRequestCurrent(next), false);
    const metadata = JSON.parse(localStorage.getItem(BROWSER_SESSION_KEY));
    assert.equal(metadata.type, "login"); assert.deepEqual(Object.keys(metadata).sort(), ["id", "type"]);
});
