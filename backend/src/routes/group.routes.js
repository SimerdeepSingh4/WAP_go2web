import { Router } from "express";
import {
    createGroup,
    getGroups,
    deleteGroup,
} from "../controllers/group.controller.js";
import { protect, blockInPreviewMode } from "../middlewares/auth.middleware.js";

const groupRouter = Router();

groupRouter.use(protect);

groupRouter.post("/", blockInPreviewMode("Group creation"), createGroup);
groupRouter.get("/", getGroups);
groupRouter.delete("/:id", blockInPreviewMode("Group deletion"), deleteGroup);

export default groupRouter;

