import { Router } from "express";
import {
    createGroup,
    getGroups,
    deleteGroup,
    getGroupById,
} from "../controllers/group.controller.js";
import { protect, authorizeRoles, blockInPreviewMode } from "../middlewares/auth.middleware.js";

const groupRouter = Router();

groupRouter.use(protect);

groupRouter.post("/", blockInPreviewMode("Group creation"), createGroup);
groupRouter.get("/", getGroups);
groupRouter.get("/:id", authorizeRoles("Super Admin"), getGroupById);
groupRouter.delete("/:id", blockInPreviewMode("Group deletion"), deleteGroup);

export default groupRouter;

