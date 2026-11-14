import test, { beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createServer, request as httpRequest } from "node:http";
import { isTrustedOrigin, isSameAppOrigin, isTrustedSocketOrigin, protectBrowserRequest } from "./browser-request.middleware.js";

let previousEnvironment;
beforeEach(() => { previousEnvironment = Object.fromEntries(["NODE_ENV", "CLIENT_URL", "RENDER_EXTERNAL_URL"].map(key => [key, process.env[key]])); });
afterEach(() => {
    for (const [key, value] of Object.entries(previousEnvironment)) {
        if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
});

function production(t, settings = {}) {
    Object.assign(process.env, { NODE_ENV: "production", CLIENT_URL: "http://localhost:5173", RENDER_EXTERNAL_URL: "", ...settings });
}
function invoke(headers, protocol = "http") {
    const req = { method: "POST", protocol, headers, get: key => headers[key] };
    const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
    let passed = false;
    protectBrowserRequest(req, res, () => { passed = true; });
    return { ...res, passed };
}

test("Render same-origin HTTPS login/logout work when Express sees internal HTTP and CLIENT_URL still points to localhost", t => {
    production(t);
    for (const route of ["/api/auth/login", "/api/auth/logout"]) {
        const result = invoke({ origin: "https://wap-go2web-2.onrender.com", host: "wap-go2web-2.onrender.com", "x-app-request": "1" });
        assert(result.passed, route);
    }
    assert(isTrustedSocketOrigin({ headers: { origin: "https://wap-go2web-2.onrender.com", host: "wap-go2web-2.onrender.com" } }));
});

test("configured frontend URLs normalize paths, trailing slashes, multiple origins and Render's external URL", t => {
    production(t, { CLIENT_URL: "https://frontend.example/login/, https://another.example/", RENDER_EXTERNAL_URL: "https://wap-go2web-2.onrender.com" });
    for (const origin of ["https://frontend.example", "https://another.example", "https://wap-go2web-2.onrender.com"]) assert(isTrustedOrigin(origin), origin);
    assert(invoke({ origin: "https://frontend.example", host: "backend.example", "x-app-request": "1" }).passed);
});

test("missing application headers and unrelated, null or lookalike origins remain rejected", t => {
    production(t);
    assert.equal(invoke({ origin: "https://wap-go2web-2.onrender.com", host: "wap-go2web-2.onrender.com" }).statusCode, 403);
    for (const origin of ["https://attacker.example", "https://wap-go2web-2.onrender.com.attacker.example", "null", "not-a-url"]) {
        assert.equal(invoke({ origin, host: "wap-go2web-2.onrender.com", "x-app-request": "1" }).statusCode, 403, origin);
        assert.equal(isTrustedSocketOrigin({ headers: { origin, host: "wap-go2web-2.onrender.com" } }), false);
    }
});

test("forwarded host/protocol headers cannot authorize an unrelated origin", t => {
    production(t);
    const headers = { origin: "https://attacker.example", host: "wap-go2web-2.onrender.com", "x-forwarded-host": "attacker.example", "x-forwarded-proto": "https", "x-app-request": "1" };
    assert.equal(isSameAppOrigin({ headers }), false);
    assert.equal(invoke(headers).statusCode, 403);
});

test("localhost development and exact HTTPS host/port matching stay supported", t => {
    production(t, { NODE_ENV: "development" });
    assert(invoke({ origin: "http://localhost:5173", host: "localhost:3000", "x-app-request": "1" }).passed);
    production(t);
    assert.equal(isSameAppOrigin({ headers: { origin: "https://app.example:8443", host: "app.example" } }), false);
    assert.equal(isSameAppOrigin({ headers: { origin: "https://app.example", host: "APP.EXAMPLE:443" } }), true);
});

test("production HTTP server reproduces Render's TLS-termination path through the login and logout handlers", async t => {
    production(t);
    const app = express();
    app.use(express.json(), protectBrowserRequest);
    app.post("/api/auth/login", (req, res) => res.cookie("token", "test-session", { httpOnly: true, secure: true, sameSite: "strict" }).json({ success: true }));
    app.post("/api/auth/logout", (req, res) => res.clearCookie("token").json({ success: true }));
    const server = createServer(app);
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    t.after(() => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); });
    const base = `http://127.0.0.1:${server.address().port}`;
    const headers = { Origin: "https://wap-go2web-2.onrender.com", Host: "wap-go2web-2.onrender.com", "X-App-Request": "1", "Content-Type": "application/json" };
    // node:fetch rewrites Host; raw HTTP preserves the proxy's public Host.
    const post = (route, requestHeaders = headers) => new Promise((resolve, reject) => {
        const req = httpRequest(base + route, { method: "POST", headers: requestHeaders }, res => {
            res.resume();
            res.on("end", () => resolve({ status: res.statusCode, headers: res.headers }));
        });
        req.on("error", reject);
        req.end("{}");
    });
    const login = await post("/api/auth/login");
    assert.equal(login.status, 200);
    assert.match(login.headers["set-cookie"].join(";"), /Secure/);
    assert.equal((await post("/api/auth/logout")).status, 200);
    assert.equal((await post("/api/auth/login", { ...headers, Origin: "https://attacker.example" })).status, 403);
});
