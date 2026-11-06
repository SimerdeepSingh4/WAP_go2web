import express from "express";
import { getHealthStatus } from "../controllers/health.controller.js";

const healthRouter = express.Router();

/**
 * Public Health & Keep-Alive Endpoint
 * Designed for uptime monitors (UptimeRobot, BetterUptime, Render cron, etc.)
 * No auth required.
 */
healthRouter.get("/", getHealthStatus);

export default healthRouter;
