import http from "http";
import mongoose from "mongoose";
import app from "./src/app.js";
import redisClient from "./src/config/redis.js";
import { getIO, initSocket } from "./src/services/socket.service.js";
import { initCampaignWorker, closeCampaignWorker } from "./src/workers/campaign.worker.js";
import { campaignQueue } from "./src/queues/campaign.queue.js";
import { startNotificationWorker, closeNotificationWorker } from "./src/workers/notification.worker.js";
import { startCreditReconciliationWorker, closeCreditReconciliationWorker } from "./src/workers/credit-reconciliation.worker.js";
import { createGracefulShutdown } from "./src/helpers/graceful-shutdown.js";

const PORT = process.env.PORT || 3000;
const server = http.createServer(app);

// 1. Initialize Socket.IO on HTTP Server
initSocket(server);
await startNotificationWorker();
startCreditReconciliationWorker();

// 2. Initialize BullMQ Campaign Worker
initCampaignWorker();

server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

const gracefulShutdown = createGracefulShutdown({
    server,
    getIO,
    closeNotificationWorker,
    closeCreditReconciliationWorker,
    closeCampaignWorker,
    campaignQueue,
    mongooseConnection: mongoose.connection,
    redisClient,
});

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
