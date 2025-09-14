const { prisma } = require("../config/database");
const ApiResponse = require("../utils/responseFormatter");

/**
 * Middleware to verify booking ownership
 * Only allows the user who created the booking to access/modify it
 */
exports.isBookingOwner = async (req, res, next) => {
  try {
    const bookingId = req.params.id;
    const userId = req.user.id;

    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      select: { userId: true },
    });

    if (!booking) {
      return ApiResponse.notFound(res, "Booking not found");
    }

    // Check if current user is the owner
    if (booking.userId !== userId) {
      return ApiResponse.forbidden(
        res,
        "Access denied: You can only manage your own bookings"
      );
    }

    // Store booking in request object for controllers
    req.booking = booking;

    next();
  } catch (error) {
    console.error("Booking owner check error:", error);
    return ApiResponse.serverError(
      res,
      "Error checking booking ownership",
      error.message
    );
  }
};
