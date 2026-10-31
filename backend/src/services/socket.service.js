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

/**
 * Initialize Socket.IO server attached to HTTP server.
 * @param {import("http").Server} httpServer
 */
export function initSocket(httpServer) {
    io = new Server(httpServer, {
        cors: {
            origin: process.env.CLIENT_URL || "http://localhost:5173",
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

            const user = await userModel.findById(decoded.id).select("-password");
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
    io.to(`session:${sessionId}`).emit(event, payload);
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
