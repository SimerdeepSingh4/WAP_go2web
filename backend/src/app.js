import express from "express";
import cors from "cors";
import path from "path";
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
import notificationRouter from "./routes/notification.routes.js";

const app = express();

// Do not serve requests or start workers until the refund index is ready.
await connectToDB();

const allowedOrigins = [
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:3000",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5174",
    process.env.CLIENT_URL,
].filter(Boolean);

app.use(cors({
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin) || origin.startsWith("http://localhost:") || origin.startsWith("http://127.0.0.1:")) {
            callback(null, true);
        } else {
            callback(null, true);
        }
    },
    credentials: true,
}));
app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use(express.json({ limit: "50mb" }));
app.use(morgan("dev"));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

app.use("/api/auth", authRouter);
app.use("/api/users", userRouter);
app.use("/api/credits", creditRouter);
app.use("/api/campaigns", campaignRouter);
app.use("/api/templates", templateRouter);
app.use("/api/groups", groupRouter);
app.use("/api/contacts", contactRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/notifications", notificationRouter);

export default app;
