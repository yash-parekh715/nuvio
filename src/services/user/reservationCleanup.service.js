const BookingService = require("./booking.service");

/**
 * Service to handle cleanup of expired reservations
 */
class ReservationCleanupService {
  /**
   * Initialize the cleanup service with a specific interval
   * @param {number} intervalMinutes - How often to run cleanup (default: 5 minutes)
   */
  static init(intervalMinutes = 5) {
    // Log startup
    console.log(
      `Initializing reservation cleanup service (interval: ${intervalMinutes} minutes)`
    );

    // Run cleanup immediately on startup
    this.runCleanup();

    // Set interval for future cleanups
    const intervalMs = intervalMinutes * 60 * 1000;
    setInterval(() => this.runCleanup(), intervalMs);
  }

  /**
   * Run the reservation cleanup process
   */
  static async runCleanup() {
    try {
      const count = await BookingService.cleanupExpiredReservations();

      if (count > 0) {
        console.log(
          `[${new Date().toISOString()}] Cleaned up ${count} expired reservations`
        );
      }
    } catch (error) {
      console.error(
        `[${new Date().toISOString()}] Reservation cleanup error:`,
        error
      );
    }
  }
}

module.exports = ReservationCleanupService;
