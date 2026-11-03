import Redis from "ioredis";
import config from "./config.js";

export const redisConnection = {
    host: config.REDIS_HOST.trim(),
    port: Number(config.REDIS_PORT),
    password: config.REDIS_PASSWORD.trim(),
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
};

export const redisClient = new Redis(redisConnection);

redisClient.on("connect", () => {
    console.log("Redis client connected for BullMQ queue operations");
});
 
redisClient.on("error", (err) => {
    console.error("Redis client error:", err.message);
});

export default redisClient;
