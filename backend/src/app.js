import fs from "fs";
import { fileURLToPath } from "url";
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
import searchRouter from "./routes/search.routes.js";
import enterpriseRouter from "./routes/enterprise.routes.js";
import healthRouter from "./routes/health.routes.js";
import { auditRequestContext } from "./services/audit.service.js";
import { uploadsStatic } from "./middlewares/uploads-static.middleware.js";

const app = express();
if (process.env.TRUST_PROXY) app.set("trust proxy", process.env.TRUST_PROXY.split(",").map((entry) => entry.trim()).filter(Boolean));

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
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use(auditRequestContext);
app.use(express.json({ limit: "50mb" }));
app.use(morgan("dev"));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use("/uploads", uploadsStatic(path.join(process.cwd(), "uploads")));

app.use("/api/auth", authRouter);
app.use("/api/users", userRouter);
app.use("/api/credits", creditRouter);
app.use("/api/campaigns", campaignRouter);
app.use("/api/templates", templateRouter);
app.use("/api/groups", groupRouter);
app.use("/api/contacts", contactRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/notifications", notificationRouter);
app.use("/api/search", searchRouter);
app.use("/api/enterprise", enterpriseRouter);

// Public Health & Keep-Alive endpoints (No auth required)
app.use("/health", healthRouter);
app.use("/api/health", healthRouter);


// Resolve frontend production build directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const possibleDistPaths = [
    path.resolve(__dirname, "../../frontend/dist"),
    path.resolve(process.cwd(), "frontend/dist"),
    path.resolve(process.cwd(), "../frontend/dist"),
    path.resolve(process.cwd(), "dist"),
];
const frontendDist = possibleDistPaths.find((p) => fs.existsSync(p));

if (frontendDist && fs.existsSync(path.join(frontendDist, "index.html"))) {
    console.log(`[Static Server] Serving frontend SPA from: ${frontendDist}`);

    // 1. Serve hashed asset chunks with long-term caching; return 404 if old chunk no longer exists
    const assetsDir = path.join(frontendDist, "assets");
    if (fs.existsSync(assetsDir)) {
        app.use("/assets", express.static(assetsDir, {
            maxAge: "1y",
            immutable: true,
            fallthrough: false,
        }));
    }

    // 2. Serve root static files (favicon, logos, etc.)
    app.use(express.static(frontendDist, {
        setHeaders: (res, filePath) => {
            if (filePath.endsWith("index.html")) {
                res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
            }
        },
    }));

    // 3. Handle SPA client-side routing: never fallback for missing static assets/chunks
    app.use((req, res, next) => {
        if (req.method === "GET" && !req.path.startsWith("/api") && !req.path.startsWith("/uploads") && !req.path.startsWith("/health") && !req.path.startsWith("/assets")) {
            res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
            return res.sendFile(path.join(frontendDist, "index.html"));
        }
        next();
    });
} else {
    console.warn("[Static Server] No frontend build found. Run 'npm run build' inside frontend directory to serve the frontend.");
}

export default app;
