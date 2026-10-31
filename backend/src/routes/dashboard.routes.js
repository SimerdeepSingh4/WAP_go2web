import { Router } from "express";
import { getDashboardStats } from "../controllers/dashboard.controller.js";
import { protect } from "../middlewares/auth.middleware.js";

const dashboardRouter = Router();

// Dashboard summary metrics for Super Admin, Reseller, and User
dashboardRouter.get("/stats", protect, getDashboardStats);

export default dashboardRouter;

