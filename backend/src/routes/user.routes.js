import { Router } from "express";
import {
    getUsers,
    getUserById,
    createUser,
    impersonateUser,
    exitPreviewMode,
    getCurrentUser,
    updateUserAccess,
} from "../controllers/user.controller.js";
import { protect, authorizeRoles } from "../middlewares/auth.middleware.js";

const userRouter = Router();

// All routes require authentication
userRouter.use(protect);
// Get current logged‑in user
userRouter.get("/me", getCurrentUser);

// Exit preview mode (any manager currently in preview mode)
userRouter.post("/exit-preview", exitPreviewMode);

// Reseller & Super Admin can view user list
userRouter.get("/", authorizeRoles("Reseller", "Super Admin"), getUsers);

// Reseller & Super Admin can create user accounts
userRouter.post("/", authorizeRoles("Reseller", "Super Admin"), createUser);

// Only Super Admin or the owning Reseller can block/unblock or set expiry.
userRouter.patch("/:id/access", authorizeRoles("Reseller", "Super Admin"), updateUserAccess);

// Access a single user's details
userRouter.get("/:id", getUserById);

// Preview / Access user account (Super Admin or assigned Reseller)
userRouter.post("/:id/access", authorizeRoles("Reseller", "Super Admin"), impersonateUser);

export default userRouter;
