import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import jwt from "jsonwebtoken";
import { io as connect } from "socket.io-client";

Object.assign(process.env, { MONGO_URI: "mongodb://127.0.0.1:1/unused", JWT_SECRET: "account-access-test-only", REDIS_HOST: "127.0.0.1", REDIS_PORT: "6379", REDIS_PASSWORD: "test-only", DOTENV_CONFIG_QUIET: "true" });
const { default: User } = await import("../models/user.model.js");
const { default: Session } = await import("../models/session.model.js");
const { protect } = await import("./auth.middleware.js");
const { login } = await import("../controllers/auth.controller.js");
const { initSocket, notifyUser } = await import("../services/socket.service.js");
const { default: Conversation } = await import("../models/supportConversation.model.js");
const { getOrCreateConversation, hasConversationAccess } = await import("../controllers/support.controller.js");
const userId = "6ae96a3caacdc8ca6d181301";
const session = { _id: "6ae96a3caacdc8ca6d181302", userId, expiresAt: new Date(Date.now() + 60000) };
const token = jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: "1h" });
const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; }, cookie() {} });

test("middleware preserves read access and rejects workspace changes for both restrictions", async t => {
  let account;
  t.mock.method(User, "findById", () => ({ select: async () => account }));
  t.mock.method(Session, "findOne", async () => session);
  for (const status of ["blocked", "expired"]) {
    account = { _id: userId, role: "User", status };
    let next = false;
    const request = { cookies: { token }, headers: { "x-expected-account": userId, "x-expected-session": session._id }, method: "GET", baseUrl: "/api/campaigns", path: "/" };
    const read = response();
    await protect(request, read, () => { next = true; });
    assert.equal(next, true);
    assert.equal(request.accountReadOnly, true);
    for (const method of ["POST", "PATCH", "PUT", "DELETE"]) {
      const write = response();
      await protect({ ...request, method }, write, () => assert.fail("Write must not reach controller"));
      assert.equal(write.code, 403);
      assert.equal(write.body.isAccountReadOnly, true);
      assert.equal(write.body.isAccountBlocked, status === "blocked");
    }
  }
});

test("blocked users can authenticate into their read-only workspace", async t => {
  const account = { _id: userId, username: "Customer", email: "customer@example.test", role: "User", status: "blocked", comparePassword: async () => true };
  t.mock.method(User, "findOne", () => ({ select: async () => account }));
  t.mock.method(Session, "deleteMany", async () => ({}));
  t.mock.method(Session, "find", () => ({ sort: async () => [] }));
  t.mock.method(Session, "create", async () => session);
  const res = response();
  await login({ body: { username: "Customer", password: "valid-test-password" }, headers: {} }, res);
  assert.equal(res.code, 200);
  assert.equal(res.body.user.status, "blocked");
  assert.equal(res.body.user.isBlocked, true);
  assert.equal(res.body.token, undefined);
  assert.equal(res.body.currentSession.id, session._id);
});

function event(socket, name, predicate = () => true) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.off(name, receive); reject(new Error(`Timed out waiting for ${name}`)); }, 4000);
    function receive(value) { if (!predicate(value)) return; clearTimeout(timer); socket.off(name, receive); resolve(value); }
    socket.on(name, receive);
  });
}

test("account recovery opens a dedicated correctly named chat for users and resellers", async t => {
  const manager = "6ae96a3caacdc8ca6d181399";
  let query;
  t.mock.method(User, "findOne", async () => ({ _id: manager }));
  t.mock.method(Conversation, "findOne", filter => {
    query = filter;
    return { populate: async () => null };
  });
  t.mock.method(Conversation, "create", async data => ({ ...data, _id: "6ae96a3caacdc8ca6d181310", populate: async () => {} }));
  for (const role of ["User", "Reseller"]) for (const status of ["expired", "blocked"]) {
    const user = { _id: userId, role, status, resellerId: role === "User" ? manager : null };
    const res = response();
    await getOrCreateConversation({ user, body: { subject: "Other subject", accountAccess: true } }, res);
    assert.equal(res.code, 201);
    assert.equal(res.body.data.subject, `Account ${status}`);
    assert.equal(query.topic, `account-${status}`);
    assert.equal(String(res.body.data.reseller), manager);
    assert.equal(hasConversationAccess(res.body.data, user), true);
    assert.equal(hasConversationAccess(res.body.data, { _id: "outsider", role: "Reseller" }), false);
  }
  const restored = response();
  await getOrCreateConversation({ user: { role: "User", status: "active" }, body: { accountAccess: true } }, restored);
  assert.equal(restored.code, 400);
});

test("WebSockets deliver block, expiry, restoration, and scheduled expiry without disconnecting", async t => {
  let account = { _id: userId, role: "User", status: "active", expiresAt: null };
  let validSession = session;
  t.mock.method(User, "findById", () => ({ select: async () => ({ ...account }) }));
  t.mock.method(Session, "findOne", async () => validSession);
  const server = createServer();
  const sockets = initSocket(server);
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const socket = connect(`http://127.0.0.1:${server.address().port}`, { extraHeaders: { Cookie: `token=${token}` }, transports: ["websocket"], reconnection: false });
  try {
    await event(socket, "connect");
    const connection = socket.id;
    for (const status of ["blocked", "expired", "active"]) {
      account = { ...account, status, accessReason: status === "blocked" ? "Contact billing" : "" };
      const changed = event(socket, "ACCOUNT_ACCESS_CHANGED", data => data.status === status);
      await notifyUser(userId, "ACCOUNT_ACCESS_CHANGED", {});
      const payload = await changed;
      assert.equal(payload.isBlocked, status === "blocked");
      assert.equal(payload.isExpired, status === "expired");
      assert.equal(socket.connected, true);
      assert.equal(socket.id, connection);
    }
    account = { ...account, expiresAt: new Date(Date.now() + 250) };
    const scheduled = event(socket, "ACCOUNT_ACCESS_CHANGED", data => data.isExpired === true);
    await notifyUser(userId, "ACCOUNT_ACCESS_CHANGED", {});
    await scheduled;
    assert.equal(socket.connected, true);
    // Revoking a real session must still sign out and disconnect the client.
    const ended = event(socket, "SESSION_EXPIRED");
    validSession = null;
    await notifyUser(userId, "ACCOUNT_ACCESS_CHANGED", {});
    assert.equal((await ended).forceLogout, true);
  } finally {
    socket.disconnect();
    await new Promise(resolve => sockets.close(resolve));
  }
});
