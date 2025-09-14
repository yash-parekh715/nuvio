/**
 * Transaction helper with deadlock detection and recovery
 * Automatically retries transactions that fail due to deadlocks
 */

/**
 * Executes a database transaction with automatic deadlock detection and retry
 * @param {Function} transactionFn - Transaction function that takes a transaction (tx) parameter
 * @param {Object} options - Configuration options
 * @param {number} options.maxRetries - Maximum number of retry attempts (default: 3)
 * @param {number} options.initialDelay - Initial delay in ms before first retry (default: 100)
 * @param {boolean} options.logging - Whether to log retry attempts (default: true)
 * @returns {Promise<any>} - Result of the transaction
 */
async function executeWithDeadlockRetry(transactionFn, options = {}) {
  const { prisma } = require("../config/database");
  const { maxRetries = 3, initialDelay = 100, logging = true } = options;

  let attempts = 0;
  let lastError;

  while (attempts <= maxRetries) {
    try {
      // Execute the transaction
      return await prisma.$transaction(transactionFn);
    } catch (error) {
      lastError = error;
      attempts++;

      // Check if error is a deadlock (PostgreSQL error code 40P01)
      const isDeadlock =
        error.code === "40P01" ||
        (error.message && error.message.includes("deadlock detected"));

      // If it's a deadlock and we haven't exceeded max retries, try again
      if (isDeadlock && attempts <= maxRetries) {
        // Calculate backoff time using exponential backoff
        const backoffTime = initialDelay * Math.pow(2, attempts - 1);

        if (logging) {
          console.log(
            `Deadlock detected (attempt ${attempts}/${maxRetries}), retrying in ${backoffTime}ms`
          );
        }

        // Wait before retrying
        await new Promise((resolve) => setTimeout(resolve, backoffTime));
        continue;
      }

      // If it's not a deadlock or we've exceeded max retries, throw the error
      throw error;
    }
  }

  // This line should never be reached, but as a safety measure
  throw lastError;
}

module.exports = {
  executeWithDeadlockRetry,
};
