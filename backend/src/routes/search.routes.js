import { Router } from "express";
import { protect } from "../middlewares/auth.middleware.js";
import { searchRecords } from "../controllers/search.controller.js";

const router = Router();
router.get("/", protect, searchRecords);
export default router;
