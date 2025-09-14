const Queue = require("bull");
const Redis = require("ioredis");
const BookingService = require("../user/booking.service");
const MockPaymentService = require("../user/mockPayment.service");

const redisUrl = process.env.REDIS_URL;

// Create Redis client with local configuration
const redisClient = new Redis(redisUrl, {
  tls: redisUrl.includes("upstash.io")
    ? {
        rejectUnauthorized: false,
      }
    : undefined,
  connectTimeout: 15000,
  keepAlive: 15000,
});

// Monitor connection
redisClient.on("connect", () => console.log("Redis connecting..."));
redisClient.on("ready", () => console.log("Redis connected successfully"));
redisClient.on("error", (err) =>
  console.error("Redis connection error:", err.message)
);
redisClient.on("close", () => console.log("Redis connection closed"));
redisClient.on("reconnecting", () => console.log("Redis reconnecting..."));

const redisOptions = {
  redis: {
    port: redisClient.options.port,
    host: redisClient.options.host,
    password: redisClient.options.password,
    tls: redisUrl.includes("upstash.io")
      ? {
          rejectUnauthorized: false,
        }
      : undefined,
  },
};
// Create queues
const cleanupQueue = new Queue("reservation-cleanup", redisOptions);
const paymentCleanupQueue = new Queue("payment-cleanup", redisOptions);

cleanupQueue.on("error", (error) => {
  console.error("Reservation cleanup queue error:", error);
});

paymentCleanupQueue.on("error", (error) => {
  console.error("Payment cleanup queue error:", error);
});

// Process reservation cleanup jobs
cleanupQueue.process(async () => {
  console.log(`[${new Date().toISOString()}] Running reservation cleanup job`);
  try {
    const count = await BookingService.cleanupExpiredReservations();
    return { processedCount: count };
  } catch (error) {
    console.error("Reservation cleanup error:", error);
    throw error;
  }
});

// Process payment intent cleanup jobs
paymentCleanupQueue.process(async () => {
  console.log(`[${new Date().toISOString()}] Running payment cleanup job`);
  try {
    const count = await MockPaymentService.cleanupExpiredPaymentIntents();
    return { processedCount: count };
  } catch (error) {
    console.error("Payment cleanup error:", error);
    throw error;
  }
});

// Handle queue errors
cleanupQueue.on("error", (error) => {
  console.error("Reservation cleanup queue error:", error);
});

paymentCleanupQueue.on("error", (error) => {
  console.error("Payment cleanup queue error:", error);
});

module.exports = {
  redisClient,
  cleanupQueue,
  paymentCleanupQueue,
  initJobScheduler: function () {
    // Schedule reservation cleanup every 5 minutes
    cleanupQueue.add(
      {},
      {
        repeat: { cron: "*/5 * * * *" },
        removeOnComplete: true,
      }
    );

    // Schedule payment cleanup daily
    paymentCleanupQueue.add(
      {},
      {
        repeat: { cron: "0 3 * * *" },
        removeOnComplete: true,
      }
    );

    console.log("Job scheduler initialized");
  },
};
