/**
 * Creates a re-entrant-safe SIGTERM/SIGINT handler that stops workers and the
 * HTTP/Socket server first, then closes Mongoose and Redis before exiting.
 */
export function createGracefulShutdown({
    server,
    getIO,
    closeNotificationWorker,
    closeCreditReconciliationWorker,
    closeCampaignWorker,
    campaignQueue,
    mongooseConnection,
    redisClient,
    timeoutMs = 10_000,
    exit = (code) => process.exit(code),
    logger = console,
}) {
    let shuttingDown = false;

    return async function gracefulShutdown(signal) {
        if (shuttingDown) return;
        shuttingDown = true;
        logger.log(`Received ${signal}. Shutting down gracefully...`);

        const forceTimer = setTimeout(() => {
            logger.error(`Graceful shutdown timed out after ${timeoutMs}ms; forcing exit.`);
            exit(1);
        }, timeoutMs);
        forceTimer.unref?.();

        let exitCode = 0;
        try {
            const closeHttp = () => new Promise((resolve) => {
                if (!server?.listening) return resolve();
                server.close((err) => {
                    if (err) {
                        logger.error("Error closing HTTP server:", err);
                        exitCode = 1;
                    } else {
                        logger.log("HTTP server closed.");
                    }
                    resolve();
                });
                server.closeIdleConnections?.();
            });

            const closeSocket = async () => {
                try {
                    const io = getIO?.();
                    if (io) await new Promise((resolve) => io.close(() => resolve()));
                } catch {
                    // Socket.IO may not be initialized yet.
                }
            };

            const results = await Promise.allSettled([
                closeNotificationWorker?.(),
                closeCreditReconciliationWorker?.(),
                closeCampaignWorker?.(),
                campaignQueue?.close?.(),
                closeSocket(),
                closeHttp(),
            ]);
            for (const result of results) {
                if (result.status === "rejected") {
                    logger.error("Error stopping server or workers:", result.reason);
                    exitCode = 1;
                }
            }

            if (mongooseConnection && mongooseConnection.readyState !== 0) {
                await mongooseConnection.close();
            }

            if (redisClient && redisClient.status !== "end") {
                try {
                    await redisClient.quit();
                } catch {
                    redisClient.disconnect?.();
                }
            }
        } catch (err) {
            logger.error("Error during graceful shutdown:", err);
            exitCode = 1;
        } finally {
            clearTimeout(forceTimer);
        }

        exit(exitCode);
    };
}
