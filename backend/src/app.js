import express from "express";
import cors from "cors";
import connectToDB from "./config/db.js";
import authRouter from "./routes/auth.routes.js";
import userRouter from "./routes/user.routes.js";
import creditRouter from "./routes/credit.routes.js";
import campaignRouter from "./routes/campaign.routes.js";
import templateRouter from "./routes/template.routes.js";
import groupRouter from "./routes/group.routes.js";
import contactRouter from "./routes/contact.routes.js";
import dashboardRouter from "./routes/dashboard.routes.js";
import cookieParser from "cookie-parser";
import morgan from "morgan";
import helmet from "helmet";

const app = express();

connectToDB();

app.use(cors({
    origin: process.env.CLIENT_URL || "http://localhost:5173",
    credentials: true,
}));
app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use(express.json());
app.use(morgan("dev"));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use("/api/auth", authRouter);
app.use("/api/users", userRouter);
app.use("/api/credits", creditRouter);
app.use("/api/campaigns", campaignRouter);
app.use("/api/templates", templateRouter);
app.use("/api/groups", groupRouter);
app.use("/api/contacts", contactRouter);
app.use("/api/dashboard", dashboardRouter);

export default app;
