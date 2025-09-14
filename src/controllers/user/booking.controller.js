const BookingService = require("../../services/user/booking.service");
const ApiResponse = require("../../utils/responseFormatter");

/**
 * Create a temporary reservation
 * @route POST /api/bookings/reserve
 */
exports.createReservation = async (req, res) => {
  try {
    const { eventId, ticketCount } = req.body;
    const userId = req.user.id;

    // Basic validation
    if (!eventId) {
      return ApiResponse.badRequest(res, "Event ID is required");
    }

    if (!ticketCount || ticketCount < 1) {
      return ApiResponse.badRequest(res, "Valid ticket count is required");
    }

    // Create reservation (15 minute expiry by default)
    const reservation = await BookingService.createReservation(
      userId,
      eventId,
      ticketCount
    );

    return ApiResponse.created(
      res,
      {
        reservationId: reservation.id,
        eventId,
        eventName: reservation.event.name,
        ticketCount,
        totalPrice: reservation.totalPrice,
        expiresAt: reservation.expiresAt,
        timeLeftMinutes: Math.round(
          (new Date(reservation.expiresAt) - new Date()) / 60000
        ),
      },
      "Reservation created successfully"
    );
  } catch (error) {
    console.error("Create reservation error:", error);

    if (error.message.includes("Cannot book tickets")) {
      return ApiResponse.badRequest(res, error.message);
    }

    if (error.message.includes("Only")) {
      return ApiResponse.badRequest(res, error.message);
    }

    if (error.message.includes("maximum of 4 tickets")) {
      return ApiResponse.badRequest(res, error.message);
    }

    if (error.message.includes("Event not found")) {
      return ApiResponse.notFound(res, "Event not found");
    }

    return ApiResponse.serverError(
      res,
      "Error creating reservation",
      error.message
    );
  }
};

/**
 * Confirm a reservation after payment
 * @route POST /api/bookings/confirm
 */
exports.confirmReservation = async (req, res) => {
  try {
    const { reservationId, paymentIntentId } = req.body;
    const userId = req.user.id;

    if (!reservationId) {
      return ApiResponse.badRequest(res, "Reservation ID is required");
    }

    // In a real implementation, we would verify the payment before confirming
    // For now, we'll just confirm the reservation
    const confirmedBooking = await BookingService.confirmReservation(
      reservationId,
      userId,
      paymentIntentId
    );

    return ApiResponse.ok(
      res,
      {
        bookingId: confirmedBooking.id,
        eventName: confirmedBooking.event.name,
        eventDate: confirmedBooking.event.startTime,
        venue: confirmedBooking.event.venueName,
        ticketCount: confirmedBooking.ticketCount,
        totalPrice: confirmedBooking.totalPrice,
      },
      "Booking confirmed successfully"
    );
  } catch (error) {
    console.error("Confirm reservation error:", error);

    if (error.message.includes("Reservation not found")) {
      return ApiResponse.notFound(res, "Reservation not found");
    }

    if (error.message.includes("Access denied")) {
      return ApiResponse.forbidden(res, error.message);
    }

    if (error.message.includes("Reservation has expired")) {
      return ApiResponse.badRequest(
        res,
        "Your reservation has expired. Please make a new booking."
      );
    }

    if (error.message.includes("already started")) {
      return ApiResponse.badRequest(res, error.message);
    }

    return ApiResponse.serverError(
      res,
      "Error confirming booking",
      error.message
    );
  }
};

/**
 * Cancel a reservation or booking
 * @route PATCH /api/bookings/:id/cancel
 */
exports.cancelBooking = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const result = await BookingService.cancelBooking(id, userId);

    // Customize message based on refund status
    let message = "Booking cancelled successfully";
    if (result.booking.status === "RESERVED") {
      message = "Reservation cancelled successfully";
    } else if (result.refund && result.refund.processed) {
      message = `Booking cancelled with ${
        result.refund.status === "FULL_REFUND" ? "full" : "partial"
      } refund of ₹${result.refund.amount}`;
    } else if (result.booking.refundStatus === "NO_REFUND") {
      message =
        "Booking cancelled without refund due to proximity to event date";
    }

    return ApiResponse.ok(res, result, message);
  } catch (error) {
    console.error("Cancel booking error:", error);

    if (error.message.includes("Access denied")) {
      return ApiResponse.forbidden(res, error.message);
    }

    if (error.message.includes("already cancelled")) {
      return ApiResponse.badRequest(res, error.message);
    }

    if (error.message.includes("already started")) {
      return ApiResponse.badRequest(res, error.message);
    }

    if (error.message.includes("Booking not found")) {
      return ApiResponse.notFound(res, "Booking not found");
    }

    return ApiResponse.serverError(
      res,
      "Error cancelling booking",
      error.message
    );
  }
};

/**
 * Get all bookings for the current user
 * @route GET /api/bookings
 */
exports.getBookings = async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      status,
      page = 1,
      limit = 10,
      timeframe,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    const result = await BookingService.getBookings(userId, {
      status,
      page,
      limit,
      timeframe,
      sortBy,
      sortOrder,
    });

    return ApiResponse.ok(res, result);
  } catch (error) {
    console.error("Get bookings error:", error);
    return ApiResponse.serverError(
      res,
      "Error fetching bookings",
      error.message
    );
  }
};

/**
 * Get a booking by ID
 * @route GET /api/bookings/:id
 */
exports.getBookingById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const booking = await BookingService.getBookingById(id, userId);
    return ApiResponse.ok(res, booking);
  } catch (error) {
    console.error("Get booking error:", error);

    if (error.message.includes("Access denied")) {
      return ApiResponse.forbidden(res, error.message);
    }

    if (error.message === "Booking not found") {
      return ApiResponse.notFound(res, "Booking not found");
    }

    return ApiResponse.serverError(
      res,
      "Error fetching booking",
      error.message
    );
  }
};

/**
 * Get payment options for a reservation
 * @route GET /api/bookings/:id/payment
 */
exports.getPaymentOptions = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const paymentOptions = await BookingService.getPaymentOptions(id, userId);
    return ApiResponse.ok(res, paymentOptions);
  } catch (error) {
    console.error("Get payment options error:", error);

    if (error.message === "Reservation not found") {
      return ApiResponse.notFound(res, "Reservation not found");
    }

    if (error.message.includes("You can only access your own")) {
      return ApiResponse.forbidden(res, error.message);
    }

    if (error.message.includes("no longer in reserved status")) {
      return ApiResponse.badRequest(res, error.message);
    }

    if (error.message.includes("reservation has expired")) {
      return ApiResponse.badRequest(res, error.message);
    }

    return ApiResponse.serverError(
      res,
      "Error fetching payment options",
      error.message
    );
  }
};
