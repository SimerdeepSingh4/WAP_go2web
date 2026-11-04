import http from "http";
import app from "./src/app.js";
import { initSocket } from "./src/services/socket.service.js";
import { initCampaignWorker, closeCampaignWorker } from "./src/workers/campaign.worker.js";
import { campaignQueue } from "./src/queues/campaign.queue.js";
import { startNotificationWorker, closeNotificationWorker } from "./src/workers/notification.worker.js";

const PORT = process.env.PORT || 3000;
const server = http.createServer(app);

// 1. Initialize Socket.IO on HTTP Server
initSocket(server);
await startNotificationWorker();

// 2. Initialize BullMQ Campaign Worker
initCampaignWorker();

server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

// Graceful shutdown
async function gracefulShutdown(signal) {
    console.log(`Received ${signal}. Shutting down gracefully...`);
    try {
        await closeNotificationWorker();
        await closeCampaignWorker();
        await campaignQueue.close();
        server.close(() => {
            console.log("HTTP server closed.");
            process.exit(0);
        });
    } catch (err) {
        console.error("Error during graceful shutdown:", err);
        process.exit(1);
    }
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
