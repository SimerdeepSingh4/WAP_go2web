import mongoose from "mongoose";
import redisClient from "../config/redis.js";

/**
 * Public Keep-Alive & Health Check Endpoint
 * Perfect for UptimeRobot, Render/Railway keep-alive cron jobs, and health monitors.
 *
 * Fast by default: responds in < 2ms without heavy DB overhead.
 * Pass `?detailed=true` for full diagnostic ping of Redis and Mongo.
 */
export async function getHealthStatus(req, res) {
    const isDetailed = req.query.detailed === "true" || req.query.full === "true";
    const uptimeSeconds = Math.floor(process.uptime());
    const isDbConnected = mongoose.connection.readyState === 1;

    if (!isDetailed) {
        // Fast keep-alive response
        return res.status(200).json({
            status: "ok",
            message: "Server is awake and healthy",
            timestamp: new Date().toISOString(),
            uptimeSeconds,
            database: isDbConnected ? "connected" : "disconnected",
        });
    }

    // Detailed diagnostic check
    const startTime = Date.now();
    let isHealthy = isDbConnected;
    let dbLatencyMs = null;
    let redisStatus = "unknown";
    let redisLatencyMs = null;

    try {
        if (isDbConnected) {
            const dbStart = Date.now();
            await mongoose.connection.db.admin().ping();
            dbLatencyMs = Date.now() - dbStart;
        }
    } catch (err) {
        isHealthy = false;
    }

    try {
        const redisStart = Date.now();
        const pong = await Promise.race([
            redisClient.ping(),
            new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 2000)),
        ]);
        if (pong === "PONG") {
            redisStatus = "up";
            redisLatencyMs = Date.now() - redisStart;
        } else {
            redisStatus = "down";
        }
    } catch {
        redisStatus = "down";
    }

    const memory = process.memoryUsage();

    return res.status(isHealthy ? 200 : 503).json({
        status: isHealthy ? "healthy" : "degraded",
        timestamp: new Date().toISOString(),
        uptimeSeconds,
        responseTimeMs: Date.now() - startTime,
        services: {
            database: {
                status: isDbConnected ? "up" : "down",
                latencyMs: dbLatencyMs,
            },
            redis: {
                status: redisStatus,
                latencyMs: redisLatencyMs,
            },
        },
        memory: {
            heapUsedMB: Math.round((memory.heapUsed / 1024 / 1024) * 100) / 100,
            rssMB: Math.round((memory.rss / 1024 / 1024) * 100) / 100,
        },
    });
}

export default { getHealthStatus };
