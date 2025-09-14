const { redisClient } = require("../services/queue/queue.service");
const { v4: uuidv4 } = require("uuid");

/**
 * Implements a distributed lock using Redis
 */
class DistributedLock {
  /**
   * Acquire a lock with retry capability
   * @param {string} resource - Resource to lock
   * @param {number} ttlMs - Time-to-live in milliseconds
   * @param {number} retries - Number of retries
   * @param {number} retryDelayMs - Delay between retries
   * @returns {Promise<string|null>} Lock token or null if unable to acquire
   */
  static async acquire(
    resource,
    ttlMs = 30000,
    retries = 5,
    retryDelayMs = 200
  ) {
    const token = uuidv4();
    let retryCount = 0;

    while (retryCount <= retries) {
      const acquired = await redisClient.set(
        `lock:${resource}`,
        token,
        "PX",
        ttlMs,
        "NX"
      );

      if (acquired) {
        return token;
      }

      retryCount++;
      if (retryCount <= retries) {
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      }
    }

    return null;
  }

  /**
   * Release a lock (only if owner)
   * @param {string} resource - Resource to unlock
   * @param {string} token - Lock token
   * @returns {Promise<boolean>} True if successfully released
   */
  static async release(resource, token) {
    // Use Lua script for atomic release-if-owner
    const result = await redisClient.eval(
      `if redis.call("get", KEYS[1]) == ARGV[1] then
         return redis.call("del", KEYS[1])
       else
         return 0
       end`,
      1,
      `lock:${resource}`,
      token
    );

    return result === 1;
  }

  /**
   * Execute a function with a distributed lock
   * @param {string} resource - Resource to lock
   * @param {Function} fn - Function to execute while holding lock
   * @param {number} ttlMs - Time-to-live in milliseconds
   * @returns {Promise<*>} Result of the function
   */
  static async withLock(resource, fn, ttlMs = 30000) {
    const token = await this.acquire(resource, ttlMs);

    if (!token) {
      throw new Error(`Could not acquire lock on resource: ${resource}`);
    }

    try {
      return await fn();
    } finally {
      await this.release(resource, token);
    }
  }
}

module.exports = DistributedLock;
