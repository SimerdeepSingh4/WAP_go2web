// Real Socket.IO clients and server with in-memory database doubles only.
import assert from "node:assert/strict";
import test from "node:test";
import http from "node:http";
import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import jwt from "jsonwebtoken";
import { Server } from "socket.io";
import { io as clientIO } from "socket.io-client";

const secret = "isolated-socket-security-test-secret";
const config = { JWT_SECRET: secret };

async function load(file, dependencies, overrides = {}) {
    const source = await readFile(new URL(file, import.meta.url), "utf8");
    const context = vm.createContext({ Buffer, console: { log() {}, error() {} }, process: { env: {} }, setTimeout, clearTimeout, setInterval, clearInterval, ...overrides });
    const imports = new Map([...source.matchAll(/import\s+([^;]+?)\s+from\s+["']([^"']+)["'];/g)].map(([, clause, name]) => [name, clause.trim()]));
    const module = new vm.SourceTextModule(source, { context });
    await module.link(async (name) => {
        const clause = imports.get(name);
        const values = clause.startsWith("{") ? Object.fromEntries(clause.slice(1, -1).split(",").map((value) => [value.trim(), () => {}])) : { default: {} };
        Object.assign(values, dependencies[name]);
        return new vm.SyntheticModule(Object.keys(values), function () {
            for (const [key, value] of Object.entries(values)) this.setExport(key, value);
        }, { context });
    });
    await module.evaluate();
    return module.namespace;
}

function waitFor(socket, event) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { socket.off(event, received); reject(new Error(`Timed out waiting for ${event}`)); }, 2500);
        function received(...args) { clearTimeout(timer); resolve(args); }
        socket.once(event, received);
    });
}

function response() {
    return { statusCode: 200, status(value) { this.statusCode = value; return this; }, json(value) { this.body = value; return this; }, clearCookie() {}, cookie() {} };
}

async function fixture(t, { fastSweep = false } = {}) {
    const users = new Map(), sessions = new Map(), clients = [];
    let databaseDown = false;
    const matches = (item, filter) => Object.entries(filter).every(([key, value]) => {
        if (value?.$gt) return new Date(item[key]) > value.$gt;
        if (value?.$in) return value.$in.map(String).includes(String(item[key]));
        return String(item[key]) === String(value);
    });
    const sessionModel = {
        async findOne(filter) { if (databaseDown) throw new Error("DB unavailable"); return [...sessions.values()].find((item) => matches(item, filter)); },
        async find(filter) { return [...sessions.values()].filter((item) => matches(item, filter)); },
        async deleteMany(filter) { for (const [id, item] of sessions) if (matches(item, filter)) sessions.delete(id); },
        async deleteOne(filter) { const item = [...sessions.values()].find((entry) => matches(entry, filter)); if (item) sessions.delete(item._id); },
    };
    const userModel = {
        findById(id) { const query = databaseDown ? Promise.reject(new Error("DB unavailable")) : Promise.resolve(users.get(String(id))); query.select = () => query; return query; },
        async updateMany() {},
    };
    const service = await load("./src/services/socket.service.js", {
        "socket.io": { Server }, jsonwebtoken: { default: jwt }, crypto: { default: crypto },
        "../config/config.js": { default: config }, "../models/session.model.js": { default: sessionModel }, "../models/user.model.js": { default: userModel },
    }, fastSweep ? { setInterval: (fn, ms) => setInterval(fn, ms === 30_000 ? 25 : ms) } : {});
    const server = http.createServer();
    const io = service.initSocket(server);
    await new Promise((resolve, reject) => { server.listen(0, "127.0.0.1", resolve); server.once("error", reject); });
    t.after(async () => { for (const client of clients) client.close(); await new Promise((resolve) => io.close(resolve)); });
    const url = `http://127.0.0.1:${server.address().port}`;
    const dependencies = {
        crypto: { default: crypto }, jsonwebtoken: { default: jwt }, "../config/config.js": { default: config },
        "../models/session.model.js": { default: sessionModel }, "../models/user.model.js": { default: userModel },
        "../models/wallet.model.js": { default: { async deleteOne() {}, async updateOne() {}, async updateMany() {} } },
        "../config/cloudinary.config.js": { default: {}, isCloudinaryConfigured: () => false },
        "../services/socket.service.js": service,
    };
    const auth = await load("./src/controllers/auth.controller.js", dependencies);
    const accounts = await load("./src/controllers/user.controller.js", dependencies);
    function account(properties = {}) {
        const user = { _id: crypto.randomUUID(), username: "Socket test", role: "User", status: "active", resellerId: null, expiresAt: null, ...properties };
        user.save = async () => users.set(user._id, user);
        user.deleteOne = async () => users.delete(user._id);
        users.set(user._id, user);
        return user;
    }
    function session(user, { tokenExpiry, expiresAt = new Date(Date.now() + 60_000), claimId = user._id } = {}) {
        const token = jwt.sign({ userId: claimId, nonce: crypto.randomUUID(), exp: tokenExpiry || Math.floor(Date.now() / 1000) + 60 }, secret);
        const record = { _id: crypto.randomUUID(), userId: user._id, tokenHash: crypto.createHash("sha256").update(token).digest("hex"), expiresAt };
        sessions.set(record._id, record);
        return { token, record };
    }
    async function connect(token, expectedError = false) {
        const socket = clientIO(url, { auth: { token }, transports: ["websocket"], reconnection: false, autoConnect: false });
        clients.push(socket);
        const ready = waitFor(socket, expectedError ? "connect_error" : "connect");
        socket.connect();
        await ready;
        return socket;
    }
    return { users, sessions, service, auth, accounts, account, session, connect, io, failDatabase: () => { databaseDown = true; } };
}

test("valid sessions receive personal, role, session and broadcast notifications", async (t) => {
    const f = await fixture(t), user = f.account(), session = f.session(user), socket = await f.connect(session.token);
    for (const send of [() => f.service.notifyUser(user._id, "CHECK", {}), () => f.service.notifyRole("User", "CHECK", {}), () => f.service.notifySession(session.record._id, "CHECK", {}), () => f.service.broadcastAll("CHECK", {})]) {
        const received = waitFor(socket, "CHECK"); await send(); await received;
    }
});

test("blocked, expired, deleted, revoked and mismatched accounts cannot connect", async (t) => {
    const f = await fixture(t);
    for (const properties of [{ status: "blocked" }, { status: "expired" }, { expiresAt: new Date(Date.now() - 100) }]) {
        const socket = await f.connect(f.session(f.account(properties)).token, true);
        assert.equal(socket.connected, false);
    }
    const user = f.account(), revoked = f.session(user);
    f.sessions.delete(revoked.record._id);
    await f.connect(revoked.token, true);
    await f.connect(f.session(user, { claimId: "another-account" }).token, true);
    const deleted = f.session(user); f.users.delete(user._id);
    await f.connect(deleted.token, true);
});

test("ordinary logout closes the transport even when the client ignores SESSION_EXPIRED", async (t) => {
    const f = await fixture(t), user = f.account(), session = f.session(user), socket = await f.connect(session.token);
    const ended = waitFor(socket, "disconnect"), res = response();
    await f.auth.logout({ headers: { authorization: `Bearer ${session.token}` } }, res);
    await ended;
    assert.equal(res.statusCode, 200);
    assert.equal(socket.connected, false);
    assert.equal(f.sessions.has(session.record._id), false);
});

test("logout all closes every session of that account without closing another account", async (t) => {
    const f = await fixture(t), user = f.account(), other = f.account();
    const first = await f.connect(f.session(user).token), second = await f.connect(f.session(user).token), unaffected = await f.connect(f.session(other).token);
    const ended = [waitFor(first, "disconnect"), waitFor(second, "disconnect")];
    await f.auth.logoutAll({ user }, response());
    await Promise.all(ended);
    assert.equal(unaffected.connected, true);
});

test("single-device logout disconnects only the selected session", async (t) => {
    const f = await fixture(t), user = f.account(), firstSession = f.session(user), secondSession = f.session(user);
    const first = await f.connect(firstSession.token), second = await f.connect(secondSession.token);
    const ended = waitFor(first, "disconnect"), res = response();
    await f.auth.logoutSession({ params: { sessionId: firstSession.record._id }, user, session: secondSession.record }, res);
    await ended;
    assert.equal(res.statusCode, 200);
    assert.equal(second.connected, true);
});

test("incoming socket actions are blocked after the session is revoked", async (t) => {
    const f = await fixture(t), user = f.account(), session = f.session(user), socket = await f.connect(session.token);
    const serverSocket = f.io.sockets.sockets.get(socket.id);
    const ended = waitFor(socket, "disconnect");
    f.sessions.delete(session.record._id);
    socket.emit("NOTIFICATION_VISIBILITY", { visible: true });
    await ended;
    assert.notEqual(serverSocket.data.notificationVisible, true);
});

for (const action of ["block", "expire", "delete", "role"]) {
    test(`${action} account operation closes existing sockets`, async (t) => {
        const f = await fixture(t), user = f.account(), socket = await f.connect(f.session(user).token);
        const ended = waitFor(socket, "disconnect"), res = response();
        const req = { params: { id: user._id }, user: { _id: "admin", role: "Super Admin" }, body: action === "block" ? { status: "blocked" } : action === "expire" ? { status: "expired" } : { role: "Reseller" } };
        await (action === "delete" ? f.accounts.deleteUser : action === "role" ? f.accounts.updateUserRole : f.accounts.updateUserAccess)(req, res);
        await ended;
        assert.equal(res.statusCode, 200, JSON.stringify(res.body));
        assert.equal(socket.connected, false);
    });
}

for (const kind of ["session", "account", "jwt"]) {
    test(`${kind} expiry closes idle sockets without another HTTP request`, async (t) => {
        const f = await fixture(t);
        const expiry = new Date(Date.now() + 250);
        const user = f.account(kind === "account" ? { expiresAt: expiry } : {});
        const session = f.session(user, kind === "session" ? { expiresAt: expiry } : kind === "jwt" ? { tokenExpiry: Math.floor(Date.now() / 1000) + 2 } : {});
        const socket = await f.connect(session.token);
        await waitFor(socket, "disconnect");
        assert.equal(socket.connected, false);
    });
}

test("changing a future account expiry updates the existing socket timer", async (t) => {
    const f = await fixture(t), user = f.account(), socket = await f.connect(f.session(user).token);
    const ended = waitFor(socket, "disconnect");
    await f.accounts.updateUserAccess({ params: { id: user._id }, user: { role: "Super Admin" }, body: { expiresAt: new Date(Date.now() + 200).toISOString() } }, response());
    await ended;
});

test("only Super Admin can grant user feature access", async (t) => {
    const f = await fixture(t), user = f.account(), adminResponse = response();
    await f.accounts.updateUserAccess({
        params: { id: user._id },
        user: { _id: "admin", role: "Super Admin" },
        body: { featureAccess: { campaignDp: true, campaignNumber: true, campaignLink: true } },
    }, adminResponse);
    assert.equal(adminResponse.statusCode, 200);
    assert.equal(user.featureAccess.campaignDp, true);
    assert.equal(user.featureAccess.campaignNumber, true);
    assert.equal(user.featureAccess.campaignLink, true);

    const resellerResponse = response();
    await f.accounts.updateUserAccess({
        params: { id: user._id },
        user: { _id: "reseller", role: "Reseller" },
        body: { featureAccess: { campaignDp: false } },
    }, resellerResponse);
    assert.equal(resellerResponse.statusCode, 403);
    assert.equal(user.featureAccess.campaignDp, true);
    assert.equal(user.featureAccess.campaignNumber, true);
    assert.equal(user.featureAccess.campaignLink, true);
});

test("outgoing events are withheld after revocation or a database permission change", async (t) => {
    const f = await fixture(t);
    for (const change of ["session", "role", "reseller", "database"]) {
        const user = f.account(), session = f.session(user), socket = await f.connect(session.token);
        let leaked = false;
        socket.on("SENSITIVE", () => { leaked = true; });
        const ended = waitFor(socket, "disconnect");
        if (change === "session") f.sessions.delete(session.record._id);
        if (change === "role") user.role = "Reseller";
        if (change === "reseller") user.resellerId = "new-manager";
        if (change === "database") f.failDatabase();
        await f.service.notifyRole("User", "SENSITIVE", { balance: 999 });
        await ended;
        assert.equal(leaked, false, change);
    }
});

test("periodic validation disconnects idle sockets revoked outside HTTP handlers", async (t) => {
    const f = await fixture(t, { fastSweep: true }), user = f.account(), session = f.session(user), socket = await f.connect(session.token);
    const ended = waitFor(socket, "disconnect");
    f.sessions.delete(session.record._id);
    await ended;
});

test("deliberate impersonation exit disconnects silently without logging out the restored account", async (t) => {
    const f = await fixture(t), user = f.account(), session = f.session(user), socket = await f.connect(session.token);
    let expired = false;
    socket.on("SESSION_EXPIRED", () => { expired = true; });
    const ended = waitFor(socket, "disconnect"), res = response();
    await f.accounts.exitFullAccessImpersonation({ isImpersonation: true, originalAdmin: { role: "Super Admin" }, token: session.token, user, session: session.record }, res);
    await ended;
    assert.equal(res.statusCode, 200);
    assert.equal(expired, false);
});

test("preview exit closes only the preview socket and preserves the manager session", async (t) => {
    const f = await fixture(t), manager = f.account({ role: "Super Admin" }), user = f.account();
    const managerSession = f.session(manager), preview = f.session(user);
    const managerSocket = await f.connect(managerSession.token), previewSocket = await f.connect(preview.token);
    let expired = false;
    previewSocket.on("SESSION_EXPIRED", () => { expired = true; });
    const ended = waitFor(previewSocket, "disconnect"), res = response();
    await f.accounts.exitPreviewMode({ isPreview: true, originalAdmin: { id: manager._id, token: managerSession.token }, token: preview.token, session: preview.record }, res);
    await ended;
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(managerSocket.connected, true);
    assert.equal(expired, false);
});
