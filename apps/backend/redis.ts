import { createClient } from "redis";

const redisHost = process.env.REDIS_HOST;
const redisPort = process.env.REDIS_PORT ? Number(process.env.REDIS_PORT) : undefined;
const redisPassword = process.env.REDIS_PASSWORD;
const redisUsername = process.env.REDIS_USERNAME || "default";

export const redis = createClient({
  username: redisUsername,
  password: redisPassword,
  socket:
    redisHost && redisPort
      ? {
          host: redisHost,
          port: redisPort,
        }
      : undefined,
});

redis.on("error", (err) => console.error("Redis Client Error", err));
redis.on("connect", () => console.log("✅ Redis connection established"));
redis.on("end", () => console.log("⚠️ Redis connection closed"));

export async function connectRedis(): Promise<void> {
  if (!redisHost || !redisPort) {
    console.warn(
      "⚠️ Redis is not configured. Set REDIS_HOST and REDIS_PORT to enable Redis caching."
    );
    return;
  }

  if (!redis.isOpen) {
    await redis.connect();
  }
}
