const EventService = require("../../services/common/event.service");
const ApiResponse = require("../../utils/responseFormatter");

/**
 * Get all events (with pagination and filtering)
 * @param {boolean} isAdmin - Whether the request is coming from an admin route
 */
exports.getEvents =
  (isAdmin = false) =>
  async (req, res) => {
    try {
      const { page, limit, status, category, search } = req.query;

      const result = await EventService.getEvents(isAdmin, {
        page,
        limit,
        status,
        category,
        search,
      });

      return ApiResponse.ok(res, result);
    } catch (error) {
      console.error("Get events error:", error);
      return ApiResponse.serverError(
        res,
        "Error fetching events",
        error.message
      );
    }
  };

/**
 * Get event by ID
 * @param {boolean} isAdmin - Whether the request is coming from an admin route
 */
exports.getEventById =
  (isAdmin = false) =>
  async (req, res) => {
    try {
      const { id } = req.params;

      const event = await EventService.getEventById(id, isAdmin);

      return ApiResponse.ok(res, event);
    } catch (error) {
      console.error("Get event by ID error:", error);

      if (error.message === "Event not found") {
        return ApiResponse.notFound(res, "Event not found");
      }

      return ApiResponse.serverError(
        res,
        "Error fetching event",
        error.message
      );
    }
  };
