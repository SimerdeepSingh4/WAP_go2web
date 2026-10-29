import { Router } from "express";
import {
    getUsers,
    getUserById,
    createUser,
    impersonateUser,
    exitPreviewMode,
} from "../controllers/user.controller.js";
import { protect, authorizeRoles } from "../middlewares/auth.middleware.js";

const userRouter = Router();

// All routes require authentication
userRouter.use(protect);

// Exit preview mode (any manager currently in preview mode)
userRouter.post("/exit-preview", exitPreviewMode);

// Reseller & Super Admin can view user list
userRouter.get("/", authorizeRoles("Reseller", "Super Admin"), getUsers);

// Reseller & Super Admin can create user accounts
userRouter.post("/", authorizeRoles("Reseller", "Super Admin"), createUser);

// Access a single user's details
userRouter.get("/:id", getUserById);

// Preview / Access user account (Super Admin or assigned Reseller)
userRouter.post("/:id/access", authorizeRoles("Reseller", "Super Admin"), impersonateUser);

export default userRouter;
