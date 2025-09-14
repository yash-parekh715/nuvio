const AnalyticsService = require("../../services/admin/analytics.service");
const ApiResponse = require("../../utils/responseFormatter");

/**
 * Get booking analytics
 * @route GET /api/admin/analytics/bookings
 */
exports.getBookingAnalytics = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const userId = req.user.id;

    const analytics = await AnalyticsService.getBookingAnalytics(userId, {
      startDate,
      endDate,
    });

    return ApiResponse.ok(res, analytics);
  } catch (error) {
    console.error("Booking analytics error:", error);
    return ApiResponse.serverError(
      res,
      "Error fetching analytics",
      error.message
    );
  }
};

/**
 * Get event analytics
 * @route GET /api/admin/analytics/events/:id
 */
exports.getEventAnalytics = async (req, res) => {
  try {
    const { id } = req.params;

    const analytics = await AnalyticsService.getEventAnalytics(id);

    return ApiResponse.ok(res, analytics);
  } catch (error) {
    console.error("Event analytics error:", error);

    if (error.message === "Event not found") {
      return ApiResponse.notFound(res, "Event not found");
    }

    return ApiResponse.serverError(
      res,
      "Error fetching event analytics",
      error.message
    );
  }
};
