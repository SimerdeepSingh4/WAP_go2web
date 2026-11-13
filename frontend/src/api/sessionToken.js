const CONTEXT_KEY = "accountContext";
const ACCESS_TOKEN_KEY = "impersonationToken";
export const BROWSER_SESSION_KEY = "browser-session-change";
let memoryRevision = "";
let identity = null;
let generation = 0;
let sessionControls = 0;
export const isSessionControlInProgress = () => sessionControls > 0;
export async function runSessionControl(operation) {
    sessionControls++;
    try { return await operation(); } finally { sessionControls--; }
}

function read(storage, key) {
    try { return storage.getItem(key); } catch { return null; }
}

export function initializeSessionState() {
    sessionStorage.removeItem("authToken");
    localStorage.removeItem("token");
    if (read(sessionStorage, ACCESS_TOKEN_KEY) && !read(sessionStorage, CONTEXT_KEY)) sessionStorage.setItem(CONTEXT_KEY, "impersonation");
}

export function getAccountContext() { return read(sessionStorage, CONTEXT_KEY) || ""; }
export function getSessionToken() { return getAccountContext() ? read(sessionStorage, ACCESS_TOKEN_KEY) : null; }
export function browserSessionRevision() { return read(localStorage, BROWSER_SESSION_KEY) || memoryRevision; }

export function rememberVerifiedSession(user, sessionId) {
    identity = user ? { accountId: String(user.id || user._id), sessionId: String(sessionId || user.sessionId || "") } : null;
}

export function invalidateSessionRequests() { generation++; identity = null; }
export function getSessionRequestScope() {
    return { revision: browserSessionRevision(), context: getAccountContext(), token: getSessionToken(), generation, ...identity };
}
export function isSessionRequestCurrent(scope, ignoreGeneration = false) {
    if (!scope) return true;
    const current = getSessionRequestScope();
    return scope.revision === current.revision && scope.context === current.context && scope.token === current.token && (ignoreGeneration || scope.generation === current.generation);
}

function setAccessToken(token, context) {
    sessionStorage.removeItem("authToken");
    sessionStorage.setItem(CONTEXT_KEY, context);
    sessionStorage.setItem(ACCESS_TOKEN_KEY, token);
    invalidateSessionRequests();
}
export function setImpersonationToken(token) { setAccessToken(token, "impersonation"); }
export function setPreviewToken(token) { setAccessToken(token, "preview"); }

export function clearCurrentSessionToken() {
    // Keep the marker: losing an access token must never fall back to cookies.
    sessionStorage.removeItem(ACCESS_TOKEN_KEY);
    sessionStorage.removeItem("authToken");
    localStorage.removeItem("token");
}
export function leaveAccountContext() {
    clearCurrentSessionToken();
    sessionStorage.removeItem(CONTEXT_KEY);
    invalidateSessionRequests();
}

export function publishBrowserSessionChange(type) {
    const revision = JSON.stringify({ id: crypto.randomUUID(), type });
    memoryRevision = revision;
    try { localStorage.setItem(BROWSER_SESSION_KEY, revision); } catch { /* BroadcastChannel also synchronizes tabs. */ }
    if (typeof BroadcastChannel !== "undefined") {
        const channel = new BroadcastChannel("browser-session");
        channel.postMessage(revision);
        channel.close();
    }
    return revision;
}

export function subscribeBrowserSessionChanges(callback) {
    let handled = browserSessionRevision();
    const receive = revision => {
        if (!revision || revision === handled || revision === memoryRevision) return;
        handled = revision;
        memoryRevision = revision;
        callback();
    };
    const storage = event => { if (event.key === BROWSER_SESSION_KEY) receive(event.newValue); };
    const channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel("browser-session");
    if (channel) channel.onmessage = event => receive(event.data);
    window.addEventListener("storage", storage);
    return () => { window.removeEventListener("storage", storage); channel?.close(); };
}
