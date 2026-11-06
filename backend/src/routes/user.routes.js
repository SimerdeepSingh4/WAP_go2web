import { Router } from "express";
import {
    getUsers,
    getUserById,
    createUser,
    impersonateUser,
    startFullAccessImpersonation,
    exitFullAccessImpersonation,
    exitPreviewMode,
    getCurrentUser,
    uploadCurrentUserProfileImage,
    updateUserAccess,
    updateManagedUserProfile,
    updateUserRole,
    deleteUser,
} from "../controllers/user.controller.js";
import { protect, authorizeRoles } from "../middlewares/auth.middleware.js";
import { uploadProfileImage } from "../middlewares/upload.middleware.js";
import { searchAccountOptions } from "../controllers/account-picker.controller.js";

const userRouter = Router();

// All routes require authentication
userRouter.use(protect);
// Get current logged‑in user
userRouter.get("/me", getCurrentUser);
userRouter.post("/me/dp-image", uploadProfileImage, uploadCurrentUserProfileImage);

// Exit preview mode (any manager currently in preview mode)
userRouter.post("/exit-preview", exitPreviewMode);
userRouter.post("/exit-impersonation", exitFullAccessImpersonation);

// Reseller & Super Admin can view user list
userRouter.get("/", authorizeRoles("Reseller", "Super Admin"), getUsers);
userRouter.get("/picker", authorizeRoles("Reseller", "Super Admin"), searchAccountOptions);

// Reseller & Super Admin can create user accounts
userRouter.post("/", authorizeRoles("Reseller", "Super Admin"), createUser);

// Only Super Admin can change account role (strictly between Reseller and User)
userRouter.patch("/:id/role", authorizeRoles("Super Admin"), updateUserRole);

// Only Super Admin or the owning Reseller can block/unblock or set expiry.
userRouter.patch("/:id/access", authorizeRoles("Reseller", "Super Admin"), updateUserAccess);
userRouter.delete("/:id", authorizeRoles("Reseller", "Super Admin"), deleteUser);

// Access a single user's details
userRouter.get("/:id", getUserById);

// Preview / Access user account (Super Admin or assigned Reseller)
userRouter.post("/:id/access", authorizeRoles("Reseller", "Super Admin"), impersonateUser);
userRouter.post("/:id/impersonate", authorizeRoles("Super Admin"), startFullAccessImpersonation);

export default userRouter;
