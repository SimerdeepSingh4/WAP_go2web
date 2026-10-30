import { Router } from "express";
import {
    register,
    login,
    logout,
    logoutAll,
    getMe,
    getActiveSessions,
} from "../controllers/auth.controller.js";
import { protect, authorizeRoles } from "../middlewares/auth.middleware.js";

const authRouter = Router();

// Public routes
authRouter.post("/login", login);
authRouter.post("/logout", logout);

// Protected routes (validates session in MongoDB)
authRouter.post("/register", protect, authorizeRoles("Super Admin", "Reseller"), register);
authRouter.get("/me", protect, getMe);
authRouter.get("/sessions", protect, getActiveSessions);
authRouter.post("/logout-all", protect, logoutAll);

// RBAC Protected routes
authRouter.get(
    "/admin-only",
    protect,
    authorizeRoles("Super Admin"),
    (req, res) => {
        res.status(200).json({
            success: true,
            message: "Welcome Super Admin! You have full access.",
            user: req.user,
        });
    }
);

authRouter.get(
    "/reseller-only",
    protect,
    authorizeRoles("Super Admin", "Reseller"),
    (req, res) => {
        res.status(200).json({
            success: true,
            message: "Welcome Reseller / Admin! You can manage reseller credits.",
            user: req.user,
        });
    }
);
Write an internal reusable helper: deductCredits(userId, count) and refundCredits(userId, count)

export default authRouter;
