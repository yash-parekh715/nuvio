const { prisma } = require("../config/database");
const ApiResponse = require("../utils/responseFormatter");

/**
 * Middleware to verify event ownership
 * Only allows the admin who created the event to access/modify it
 */
exports.isEventOwner = async (req, res, next) => {
  try {
    const eventId = req.params.id;
    const userId = req.user.id;

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { createdBy: true },
    });

    if (!event) {
      return ApiResponse.notFound(res, "Event not found");
    }

    // Check if current user is the creator
    if (event.createdBy !== userId) {
      return ApiResponse.forbidden(
        res,
        "Access denied: You can only manage events you created"
      );
    }

    next();
  } catch (error) {
    console.error("Owner check error:", error);
    return ApiResponse.serverError(
      res,
      "Error checking event ownership",
      error.message
    );
  }
};
