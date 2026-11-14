import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import mongoose from "mongoose";
import bcrypt from "bcrypt";
import express from "express";
import cookieParser from "cookie-parser";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { io as connect } from "socket.io-client";

Object.assign(process.env, { MONGO_URI: "mongodb://127.0.0.1/browser-session-test", JWT_SECRET: "browser-session-test-secret", REDIS_HOST: "127.0.0.1", REDIS_PORT: "6379", REDIS_PASSWORD: "test", AUDIT_SIGNING_KEY: "browser-session-test-audit-key-at-least-32-bytes", CLIENT_URL: "http://localhost:5173", DOTENV_CONFIG_QUIET: "true" });
const { default: User } = await import("../models/user.model.js");
const { default: Session } = await import("../models/session.model.js");
const { AuditEvent, AuditHead } = await import("../models/audit.model.js");
const { NotificationEvent } = await import("../models/notification.model.js");
const { default: authRouter } = await import("../routes/auth.routes.js");
const { protect } = await import("../middlewares/auth.middleware.js");
const { protectBrowserRequest } = await import("../middlewares/browser-request.middleware.js");
const { startFullAccessImpersonation, exitFullAccessImpersonation, impersonateUser, exitPreviewMode } = await import("../controllers/user.controller.js");
const { initSocket } = await import("../services/socket.service.js");

let mongo, server, sockets, origin, writes = 0;
const accounts = {};
const password = "test-session-password";
before(async () => {
    mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await mongoose.connect(mongo.getUri(), { autoIndex: false });
    await Promise.all([User.init(), Session.init(), AuditEvent.init(), AuditHead.init(), NotificationEvent.init()]);
    const hash = await bcrypt.hash(password, 4);
    for (const role of ["Super Admin", "Reseller", "User"]) {
        const account = { _id: new mongoose.Types.ObjectId(), username: role, email: `${role.replace(/ /g, "")}@example.test`, role, status: "active", password: hash };
        accounts[role] = account;
        await User.collection.insertOne(account);
    }
    const app = express();
    app.use(express.json()); app.use(cookieParser()); app.use(protectBrowserRequest);
    app.use("/api/auth", authRouter);
    app.post("/api/users/:id/impersonate", protect, startFullAccessImpersonation);
    app.post("/api/users/:id/access", protect, impersonateUser);
    app.post("/api/users/exit-preview", protect, exitPreviewMode);
    app.post("/api/users/exit-impersonation", protect, exitFullAccessImpersonation);
    app.post("/api/change", protect, (req, res) => { writes++; res.json({ userId: String(req.user._id) }); });
    server = createServer(app); sockets = initSocket(server);
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    origin = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
    if (sockets) await new Promise(resolve => sockets.close(resolve));
    if (server?.listening) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    await mongoose.disconnect(); await mongo?.stop();
});

async function request(path, { jar, cookie = jar?.cookie, bearer, context, expectedAccount = context ? undefined : jar?.userId, expectedSession = context ? undefined : jar?.sessionId, method = "GET", body, appHeader = true, origin: requestOrigin } = {}) {
    const headers = { "Content-Type": "application/json" };
    if (appHeader) headers["X-App-Request"] = "1";
    if (cookie) headers.Cookie = cookie;
    if (bearer) headers.Authorization = `Bearer ${bearer}`;
    if (context) headers["X-Account-Context"] = context;
    if (expectedAccount) headers["X-Expected-Account"] = String(expectedAccount);
    if (expectedSession) headers["X-Expected-Session"] = String(expectedSession);
    if (requestOrigin) headers.Origin = requestOrigin;
    const response = await fetch(origin + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const setCookie = response.headers.get("set-cookie");
    if (jar && setCookie) jar.cookie = setCookie.split(";")[0];
    return { status: response.status, body: await response.json(), setCookie };
}
async function login(role, jar = {}) {
    const response = await request("/api/auth/login", { jar, method: "POST", body: { username: role, password } });
    assert.equal(response.status, 200, JSON.stringify(response.body));
    jar.userId = response.body.user.id; jar.sessionId = response.body.currentSession.id;
    return jar;
}
const me = options => request("/api/auth/me", options);

test("one cookie identifies every tab, legacy Bearer tokens cannot override it, and login returns no ordinary token", async () => {
    const browser = await login("User");
    const oldToken = browser.cookie.slice(6);
    const admin = await login("Super Admin", browser);
    assert.equal((await me({ jar: browser })).body.user.role, "Super Admin");
    assert.equal((await me({ jar: browser, bearer: oldToken })).body.user.role, "Super Admin");
    assert.equal((await me({ bearer: oldToken })).status, 401);
    const response = await request("/api/auth/login", { jar: browser, method: "POST", body: { username: "Super Admin", password } });
    assert.equal(response.body.token, undefined);
    assert.match(response.setCookie, /HttpOnly/);
    assert.match(response.setCookie, /SameSite=Strict/);
    assert.equal(await Session.exists({ _id: admin.sessionId }), null);
});

test("actions and logout from a stale account tab cannot affect the new signed-in account", async () => {
    const browser = await login("User");
    const oldAccount = browser.userId, oldSession = browser.sessionId;
    await login("Reseller", browser);
    const before = writes;
    const stale = { jar: browser, method: "POST", body: {}, expectedAccount: oldAccount, expectedSession: oldSession };
    const change = await request("/api/change", stale);
    assert.equal(change.status, 409); assert.equal(change.body.code, "BROWSER_SESSION_CHANGED");
    assert.equal(writes, before);
    assert.equal((await request("/api/change", { cookie: browser.cookie, method: "POST", body: {} })).status, 409);
    assert.equal((await request("/api/auth/logout", stale)).status, 409);
    assert.equal((await me({ jar: browser })).body.user.role, "Reseller");
});

test("logout revokes the browser session for every tab, while separate browser profiles remain signed in", async () => {
    const browser = await login("User"), separateProfile = await login("User");
    const tabCookie = browser.cookie;
    assert.equal((await request("/api/auth/logout", { jar: browser, method: "POST", body: {} })).status, 200);
    assert.equal((await me({ cookie: tabCookie })).status, 401);
    assert.equal((await me({ jar: separateProfile })).status, 200);
    assert.equal((await request("/api/auth/logout", { jar: browser, method: "POST", body: {} })).status, 200);
});

test("impersonation is explicit, bound to its manager cookie, and never replaces the normal browser account", async () => {
    const manager = await login("Super Admin"), unrelatedManager = await login("Super Admin");
    const access = await request(`/api/users/${accounts.User._id}/impersonate`, { jar: manager, method: "POST", body: {} });
    assert.equal(access.status, 200); assert.equal(access.setCookie, null);
    const token = access.body.token;
    assert.equal((await me({ jar: manager, context: "impersonation", bearer: token })).body.user.isImpersonation, true);
    assert.equal((await me({ jar: manager })).body.user.role, "Super Admin");
    assert.equal((await me({ jar: manager, bearer: token })).body.user.role, "Super Admin");
    assert.equal((await me({ jar: manager, context: "impersonation" })).status, 401);
    assert.equal((await me({ jar: unrelatedManager, context: "impersonation", bearer: token })).status, 401);
    const ended = await request("/api/users/exit-impersonation", { jar: manager, context: "impersonation", bearer: token, method: "POST", body: {} });
    assert.equal(ended.status, 200); assert.equal(ended.setCookie, null);
    assert.equal((await me({ jar: manager })).status, 200);
    assert.equal((await me({ jar: manager, context: "impersonation", bearer: token })).status, 401);
});

test("preview keeps the manager cookie intact and can exit without exposing the manager token", async () => {
    const manager = await login("Super Admin");
    const preview = await request(`/api/users/${accounts.User._id}/access`, { jar: manager, method: "POST", body: {} });
    assert.equal(preview.status, 200); assert.equal(preview.setCookie, null);
    const decoded = JSON.parse(Buffer.from(preview.body.token.split(".")[1], "base64url").toString());
    assert.equal(decoded.originalAdmin.token, undefined);
    const exit = await request("/api/users/exit-preview", { jar: manager, context: "preview", bearer: preview.body.token, method: "POST", body: {} });
    assert.equal(exit.status, 200); assert.equal(exit.body.token, undefined); assert.equal(exit.setCookie, null);
    assert.equal((await me({ jar: manager })).body.user.role, "Super Admin");
});

test("switching the browser account revokes its dependent account access sessions", async () => {
    const manager = await login("Super Admin");
    const access = await request(`/api/users/${accounts.User._id}/impersonate`, { jar: manager, method: "POST", body: {} });
    const originalCookie = manager.cookie;
    await login("Reseller", manager);
    assert.equal((await me({ cookie: originalCookie, context: "impersonation", bearer: access.body.token })).status, 401);
    assert.equal((await me({ jar: manager, context: "impersonation", bearer: access.body.token })).status, 401);
});

test("cookie-authenticated mutations require the application header and a trusted origin", async () => {
    const browser = await login("User");
    assert.equal((await request("/api/change", { jar: browser, method: "POST", body: {}, appHeader: false })).status, 403);
    assert.equal((await request("/api/change", { jar: browser, method: "POST", body: {}, origin: "https://untrusted.example" })).status, 403);
    assert.equal((await request("/api/change", { jar: browser, method: "POST", body: {}, origin: "http://localhost:5173" })).status, 200);
});

test("WebSockets use the same cookie account and a socket closes when that browser switches accounts", async () => {
    const browser = await login("User");
    const admin = await login("Super Admin");
    const socket = connect(origin, { transports: ["websocket"], reconnection: false, extraHeaders: { Cookie: browser.cookie }, auth: { token: admin.cookie.slice(6) } });
    try {
        await new Promise((resolve, reject) => { socket.once("connect", resolve); socket.once("connect_error", reject); });
        assert.equal(sockets.sockets.sockets.get(socket.id).user.role, "User");
        const ended = new Promise(resolve => socket.once("disconnect", resolve));
        await login("Reseller", browser);
        await ended;
        assert.equal(socket.connected, false);
    } finally { socket.disconnect(); }
});
