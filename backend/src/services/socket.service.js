import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import config from "../config/config.js";
import sessionModel from "../models/session.model.js";
import userModel from "../models/user.model.js";

let io = null;

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

            // Verify active session against DB (enforces single-device / 3-device limits)
            const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
            const session = await sessionModel.findOne({
                tokenHash,
                expiresAt: { $gt: new Date() },
            });

            if (!session) {
                return next(new Error("Authentication error: Session expired or evicted."));
            }

            const targetUserId = decoded.userId || decoded.id || session.userId;
            const user = await userModel.findById(targetUserId).select("-password");
            if (!user) {
                return next(new Error("Authentication error: User not found."));
            }

            socket.user = user;
            socket.sessionId = session._id.toString();
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

        socket.on("disconnect", () => {
            // Cleanup happens automatically in Socket.IO
        });
    });

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
    io.to(`user:${userId.toString()}`).emit(event, payload);
}

/**
 * Emit event to all users with a specific role (e.g. 'Super Admin', 'Reseller').
 * @param {string} role
 * @param {string} event
 * @param {object} payload
 */
export function notifyRole(role, event, payload) {
    if (!io || !role) return;
    io.to(`role:${role}`).emit(event, payload);
}

/**
 * Emit event to the reseller of a client.
 * @param {string|mongoose.Types.ObjectId} resellerId
 * @param {string} event
 * @param {object} payload
 */
export function notifyReseller(resellerId, event, payload) {
    if (!io || !resellerId) return;
    io.to(`user:${resellerId.toString()}`).emit(event, payload);
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
    io.to(room).emit(event, payload);
    if (event === "SESSION_EXPIRED") {
        setTimeout(async () => {
            try {
                const sockets = await io.in(room).fetchSockets();
                for (const s of sockets) {
                    s.disconnect(true);
                }
            } catch (err) {
                console.error("Error disconnecting socket session:", err);
            }
        }, 500);
    }
}

/**
 * Broadcast event to all connected sockets.
 * @param {string} event
 * @param {object} payload
 */
export function broadcastAll(event, payload) {
    if (!io) return;
    io.emit(event, payload);
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
