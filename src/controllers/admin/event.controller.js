const EventService = require("../../services/admin/event.service");
const ApiResponse = require("../../utils/responseFormatter");

/**
 * Create a new event
 * @route POST /api/admin/events
 */
exports.createEvent = async (req, res) => {
  try {
    const event = await EventService.createEvent(req.body, req.user.id);
    return ApiResponse.created(res, event, "Event created successfully");
  } catch (error) {
    console.error("Create event error:", error);

    if (error.message === "Missing required fields") {
      return ApiResponse.badRequest(res, "Missing required fields");
    }

    if (error.message === "End time must be after start time") {
      return ApiResponse.badRequest(res, "End time must be after start time");
    }

    if (error.message === "Cannot create events with start time in the past") {
      return ApiResponse.badRequest(
        res,
        "Cannot create events with start time in the past"
      );
    }

    return ApiResponse.serverError(res, "Error creating event", error.message);
  }
};

/**
 * Update event with concurrency control
 * @route PATCH /api/admin/events/:id
 */
exports.updateEvent = async (req, res) => {
  try {
    const { id } = req.params;
    const updatedEvent = await EventService.updateEvent(id, req.body);

    // If we're cancelling, use a special message
    const message =
      req.body.status === "CANCELLED"
        ? "Event cancelled successfully"
        : "Event updated successfully";

    return ApiResponse.ok(res, updatedEvent, message);
  } catch (error) {
    console.error("Update event error:", error);

    if (error.message.includes("already cancelled")) {
      return ApiResponse.badRequest(res, error.message);
    }

    if (error.message.includes("Event has already started")) {
      return ApiResponse.badRequest(res, error.message);
    }

    if (error.message.includes("Cannot reduce capacity")) {
      return ApiResponse.badRequest(res, error.message);
    }

    if (error.message.includes("Cannot modify cancelled events")) {
      return ApiResponse.badRequest(res, error.message);
    }

    if (error.message.includes("Event has ended")) {
      return ApiResponse.badRequest(res, error.message);
    }

    if (error.message.includes("Cannot enable bookings")) {
      return ApiResponse.badRequest(res, error.message);
    }

    if (error.message.includes("Event not found")) {
      return ApiResponse.notFound(res, "Event not found");
    }

    return ApiResponse.serverError(res, "Error updating event", error.message);
  }
};

/**
 * Delete event with concurrency control
 * @route DELETE /api/admin/events/:id
 */
exports.deleteEvent = async (req, res) => {
  try {
    const { id } = req.params;
    await EventService.deleteEvent(id);
    return ApiResponse.ok(res, null, "Event deleted successfully");
  } catch (error) {
    console.error("Delete event error:", error);

    if (error.message.includes("Cannot delete event with active bookings")) {
      return ApiResponse.badRequest(
        res,
        "Cannot delete event with active bookings. Cancel the event instead."
      );
    }

    if (error.message.includes("Event not found")) {
      return ApiResponse.notFound(res, "Event not found");
    }

    return ApiResponse.serverError(res, "Error deleting event", error.message);
  }
};
