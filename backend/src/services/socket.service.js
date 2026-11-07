import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import config from "../config/config.js";
import sessionModel from "../models/session.model.js";
import userModel from "../models/user.model.js";

let io = null;
const REVALIDATE_MS = 30_000;
const VALIDATION_TIMEOUT_MS = 5_000;
const expiryTimers = new WeakMap();

function endSocket(socket, reason = "Session access ended. Please sign in again.") {
    if (!socket.connected) return;
    socket.emit("SESSION_EXPIRED", { reason, forceLogout: true });
    socket.disconnect(true);
}

function armExpiry(socket, deadline) {
    clearTimeout(expiryTimers.get(socket));
    const timer = setTimeout(() => {
        if (Date.now() >= deadline) endSocket(socket, "Your session or account has expired.");
        else armExpiry(socket, deadline);
    }, Math.max(0, Math.min(deadline - Date.now(), 2_147_483_647)));
    timer.unref();
    expiryTimers.set(socket, timer);
}

async function loadAccess(auth) {
    if (!Number.isFinite(auth.tokenExpiresAt) || auth.tokenExpiresAt <= Date.now()) throw new Error("Session expired.");
    const filter = { tokenHash: auth.tokenHash, expiresAt: { $gt: new Date() } };
    if (auth.sessionId) filter._id = auth.sessionId;
    if (auth.userId) filter.userId = auth.userId;
    const session = await sessionModel.findOne(filter);
    if (!session) throw new Error("Session was revoked or expired.");
    const user = await userModel.findById(session.userId).select("_id role resellerId status expiresAt");
    if (!user || user.status !== "active" || (user.expiresAt && new Date(user.expiresAt).getTime() <= Date.now())) {
        throw new Error("Account is unavailable, blocked or expired.");
    }
    if (auth.role !== undefined && (user.role !== auth.role || String(user.resellerId || "") !== auth.resellerId)) {
        throw new Error("Account permissions changed. Please sign in again.");
    }
    const deadline = Math.min(auth.tokenExpiresAt, new Date(session.expiresAt).getTime(), user.expiresAt ? new Date(user.expiresAt).getTime() : Infinity);
    if (!Number.isFinite(deadline) || deadline <= Date.now()) throw new Error("Session expired.");
    return { user, session, deadline };
}

async function boundedAccess(auth) {
    let timer;
    try {
        return await Promise.race([
            loadAccess(auth),
            new Promise((_, reject) => {
                timer = setTimeout(() => reject(new Error("Session verification unavailable.")), VALIDATION_TIMEOUT_MS);
                timer.unref();
            }),
        ]);
    } finally { clearTimeout(timer); }
}

async function checkConnectedSocket(socket) {
    try {
        const access = await boundedAccess(socket.data.auth);
        if (!socket.connected) return false;
        socket.user = access.user;
        armExpiry(socket, access.deadline);
        return true;
    } catch {
        endSocket(socket);
        return false;
    }
}

async function emitAuthorized(room, event, payload) {
    if (!io) return;
    // All application notifications pass through this guard. Socket.IO incoming
    // middleware alone cannot stop an already connected client receiving events.
    const sockets = [...io.sockets.sockets.values()].filter((socket) => !room || socket.rooms.has(room));
    await Promise.all(sockets.map(async (socket) => {
        if (await checkConnectedSocket(socket)) socket.emit(event, payload);
    }));
}

function endRoom(room, payload = {}, silent = false) {
    if (!io) return;
    if (!silent) io.to(room).emit("SESSION_EXPIRED", { reason: "Session access ended. Please sign in again.", ...payload, forceLogout: true });
    // The server closes the transport; ignoring the frontend event cannot retain access.
    io.in(room).disconnectSockets(true);
}

function parseCookie(cookieStr, name) {
    if (!cookieStr) return null;
    const match = cookieStr.match(new RegExp(`(^|;\\s*)${name}=([^;]+)`));
    return match ? decodeURIComponent(match[2]) : null;
}

const allowedOrigins = [
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:3000",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5174",
    process.env.CLIENT_URL,
].filter(Boolean);

/**
 * Initialize Socket.IO server attached to HTTP server.
 * @param {import("http").Server} httpServer
 */
export function initSocket(httpServer) {
    io = new Server(httpServer, {
        cors: {
            origin: (origin, callback) => {
                if (!origin || allowedOrigins.includes(origin) || origin.startsWith("http://localhost:") || origin.startsWith("http://127.0.0.1:")) {
                    callback(null, true);
                } else {
                    callback(null, true);
                }
            },
            credentials: true,
        },
        pingTimeout: 60000,
    });

    // ── Authentication Middleware ─────────────────────────────────
    io.use(async (socket, next) => {
        try {
            // Extract token from auth payload, authorization header, or cookie
            let token = socket.handshake.auth?.token;

            if (!token && socket.handshake.headers?.authorization) {
                const parts = socket.handshake.headers.authorization.split(" ");
                if (parts.length === 2 && /^Bearer$/i.test(parts[0])) {
                    token = parts[1];
                }
            }

            if (!token && socket.handshake.headers?.cookie) {
                token = parseCookie(socket.handshake.headers.cookie, "token");
            }

            if (!token) {
                return next(new Error("Authentication error: No session token provided."));
            }

            // Verify JWT
            let decoded;
            try {
                decoded = jwt.verify(token, config.JWT_SECRET);
            } catch (err) {
                return next(new Error("Authentication error: Invalid or expired token."));
            }

            const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
            const auth = { tokenHash, userId: decoded.userId || decoded.id, tokenExpiresAt: decoded.exp * 1000 };
            const { user, session, deadline } = await boundedAccess(auth);
            socket.user = user;
            socket.sessionId = session._id.toString();
            socket.data.auth = { ...auth, userId: String(user._id), sessionId: socket.sessionId, role: user.role, resellerId: String(user.resellerId || "") };
            socket.data.sessionId = socket.sessionId;
            socket.data.accessDeadline = deadline;
            return next();
        } catch (error) {
            console.error("Socket authentication error:", error);
            return next(new Error("Internal server error during socket authentication."));
        }
    });

    // ── Connection & Dynamic Room Assignment ──────────────────────
    io.on("connection", (socket) => {
        const { _id, role, resellerId } = socket.user;
        const userIdStr = _id.toString();

        // 1. Personal Room: for wallet updates, personal refunds, notifications
        socket.join(`user:${userIdStr}`);

        // 2. Role Room: e.g. "role:Super Admin" gets new campaign submissions, triage alerts
        socket.join(`role:${role}`);

        // 3. Reseller Hierarchy Room: Reseller gets events for their clients
        if (resellerId) {
            socket.join(`client_of:${resellerId.toString()}`);
        }

        // 4. Session Room: for targeted eviction of a specific device
        socket.join(`session:${socket.sessionId}`);
        socket.data.sessionId = socket.sessionId;
        armExpiry(socket, socket.data.accessDeadline);
        // Close the race between the initial DB check and joining notification rooms.
        void checkConnectedSocket(socket);
        socket.use(async (packet, next) => {
            if (await checkConnectedSocket(socket)) next();
        });
        socket.on("NOTIFICATION_VISIBILITY", (data) => {
            socket.data.notificationVisible = data?.visible === true;
        });

        socket.on("disconnect", () => {
            clearTimeout(expiryTimers.get(socket));
            expiryTimers.delete(socket);
        });
    });

    // Idle connections must also lose access when records change outside HTTP handlers.
    const serverIO = io;
    const validationTimer = setInterval(() => {
        for (const socket of serverIO.sockets.sockets.values()) void checkConnectedSocket(socket);
    }, REVALIDATE_MS);
    validationTimer.unref();
    httpServer.once("close", () => clearInterval(validationTimer));

    console.log("Socket.IO initialized successfully with JWT & Room security.");
    return io;
}

/**
 * Get the initialized Socket.IO instance.
 */
export function getIO() {
    if (!io) {
        throw new Error("Socket.IO has not been initialized. Call initSocket(server) first.");
    }
    return io;
}

/**
 * Emit event to a specific user's private room.
 * @param {string|mongoose.Types.ObjectId} userId
 * @param {string} event
 * @param {object} payload
 */
export function notifyUser(userId, event, payload) {
    if (!io || !userId) return;
    const room = `user:${userId.toString()}`;
    if (event === "SESSION_EXPIRED") return endRoom(room, payload);
    if (event === "ROLE_CHANGED") return endRoom(room, { reason: payload?.message || "Your account permissions changed." });
    return emitAuthorized(room, event, payload);
}

/**
 * Emit event to all users with a specific role (e.g. 'Super Admin', 'Reseller').
 * @param {string} role
 * @param {string} event
 * @param {object} payload
 */
export function notifyRole(role, event, payload) {
    if (!io || !role) return;
    return emitAuthorized(`role:${role}`, event, payload);
}

/**
 * Emit event to the reseller of a client.
 * @param {string|mongoose.Types.ObjectId} resellerId
 * @param {string} event
 * @param {object} payload
 */
export function notifyReseller(resellerId, event, payload) {
    if (!io || !resellerId) return;
    return emitAuthorized(`user:${resellerId.toString()}`, event, payload);
}

/**
 * Emit event to a specific device session (e.g. For instant 4th-device eviction).
 * @param {string} sessionId
 * @param {string} event
 * @param {object} payload
 */
export function notifySession(sessionId, event, payload) {
    if (!io || !sessionId) return;
    const room = `session:${sessionId.toString()}`;
    if (event === "SESSION_EXPIRED") return endRoom(room, payload);
    if (event === "SESSION_CLOSED") return endRoom(room, {}, true);
    return emitAuthorized(room, event, payload);
}

/**
 * Broadcast event to all connected sockets.
 * @param {string} event
 * @param {object} payload
 */
export function broadcastAll(event, payload) {
    if (!io) return;
    return emitAuthorized(null, event, payload);
}

export default {
    initSocket,
    getIO,
    notifyUser,
    notifyRole,
    notifyReseller,
    notifySession,
    broadcastAll,
};
