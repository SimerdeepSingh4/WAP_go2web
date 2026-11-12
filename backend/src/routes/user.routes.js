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
    removeCurrentUserProfileImage,
    uploadManagedUserProfileImage,
    updateUserAccess,
    updateWhiteLabelAccess,
    updateManagedUserProfile,
    updateUser,
    updateUserRole,
    deleteUser,
} from "../controllers/user.controller.js";
import { protect, authorizeRoles, blockInPreviewMode } from "../middlewares/auth.middleware.js";
import { uploadProfileImage } from "../middlewares/upload.middleware.js";
import { searchAccountOptions } from "../controllers/account-picker.controller.js";

const userRouter = Router();

// All routes require authentication
userRouter.use(protect);
// Get current logged‑in user
userRouter.get("/me", getCurrentUser);
userRouter.post("/me/dp-image", uploadProfileImage, uploadCurrentUserProfileImage);
userRouter.delete("/me/dp-image", removeCurrentUserProfileImage);
userRouter.post("/:id/dp-image", authorizeRoles("Super Admin"), uploadProfileImage, uploadManagedUserProfileImage);

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

// Only Super Admin can grant, revoke, or set expiry for white-label access on Resellers
userRouter.patch("/:id/white-label-access", authorizeRoles("Super Admin"), updateWhiteLabelAccess);

// Only Super Admin or the owning Reseller can block/unblock or set expiry.
userRouter.patch("/:id/access", authorizeRoles("Reseller", "Super Admin"), updateUserAccess);

// Admin account edits, including optional password resets.
userRouter.patch("/:id", authorizeRoles("Super Admin"), blockInPreviewMode("Account updates"), updateUser);
userRouter.delete("/:id", authorizeRoles("Reseller", "Super Admin"), deleteUser);

// Access a single user's details
userRouter.get("/:id", getUserById);

// Preview / Access user account (Super Admin or assigned Reseller)
userRouter.post("/:id/access", authorizeRoles("Reseller", "Super Admin"), impersonateUser);
userRouter.post("/:id/impersonate", authorizeRoles("Super Admin"), startFullAccessImpersonation);

export default userRouter;
