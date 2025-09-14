const { redisClient } = require("../services/queue/queue.service");

/**
 * Service for caching data to reduce database calls
 */
class CacheService {
  /**
   * Get data from cache or fetch and cache if not found
   * @param {string} key - Cache key
   * @param {Function} fetchFn - Function to fetch data if not in cache
   * @param {number} ttl - Time to live in seconds
   * @returns {Promise<any>} - The data
   */
  static async getOrSet(key, fetchFn, ttl = 300) {
    // Try to get from cache first
    const cachedData = await redisClient.get(key);

    if (cachedData) {
      return JSON.parse(cachedData);
    }

    // If not in cache, fetch data
    const data = await fetchFn();

    // Store in cache (only if data exists)
    if (data) {
      await redisClient.setex(key, ttl, JSON.stringify(data));
    }

    return data;
  }

  /**
   * Invalidate a specific cache key
   * @param {string} key - Cache key to invalidate
   */
  static async invalidate(key) {
    await redisClient.del(key);
  }

  /**
   * Invalidate multiple cache keys using a pattern
   * @param {string} pattern - Pattern to match keys (e.g. "event:*")
   */
  static async invalidatePattern(pattern) {
    const keys = await redisClient.keys(pattern);
    if (keys.length > 0) {
      await redisClient.del(keys);
    }
  }
}

module.exports = CacheService;
