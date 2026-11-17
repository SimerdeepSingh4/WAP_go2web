import express from "express";
import { protect } from "../middlewares/auth.middleware.js";
import { listPins, createPin, deletePin, resolvePin } from "../controllers/reviewPin.controller.js";

const router = express.Router();

router.use(protect);

router.get("/", listPins);
router.post("/", createPin);
router.patch("/:id/resolve", resolvePin);
router.delete("/:id", deletePin);

export default router;
