const ApiResponse = require("../../utils/responseFormatter");
const { prisma } = require("../../config/database");
const MockPaymentService = require("../../services/user/mockPayment.service");
const BookingService = require("../../services/user/booking.service");

/**
 * Create a payment intent for a reservation
 * @route POST /api/payments/create-intent
 */
exports.createPaymentIntent = async (req, res) => {
  try {
    const { reservationId, paymentMethod = "card" } = req.body;
    const userId = req.user.id;

    if (!reservationId) {
      return ApiResponse.badRequest(res, "Reservation ID is required");
    }

    // Find the reservation
    const reservation = await prisma.booking.findUnique({
      where: { id: reservationId },
      select: {
        id: true,
        userId: true,
        eventId: true,
        ticketCount: true,
        totalPrice: true,
        status: true,
        reservationExpiry: true,
        event: {
          select: {
            name: true,
            startTime: true,
          },
        },
      },
    });

    // Validate reservation
    if (!reservation) {
      return ApiResponse.notFound(res, "Reservation not found");
    }

    if (reservation.userId !== userId) {
      return ApiResponse.forbidden(
        res,
        "You can only pay for your own reservations"
      );
    }

    if (reservation.status !== "RESERVED") {
      return ApiResponse.badRequest(
        res,
        "Cannot process payment for a non-reserved booking"
      );
    }

    // Check if reservation has expired
    if (new Date(reservation.reservationExpiry) < new Date()) {
      return ApiResponse.badRequest(
        res,
        "Reservation has expired. Please make a new booking."
      );
    }

    await prisma.booking.update({
      where: { id: reservationId },
      data: {
        paymentProcessing: true,
        paymentInitiatedAt: new Date(),
      },
    });

    // Create a payment intent with our mock payment service
    const paymentIntent = await MockPaymentService.createPaymentIntent(
      reservation,
      paymentMethod
    );

    return ApiResponse.ok(res, {
      clientSecret: paymentIntent.clientSecret,
      paymentIntentId: paymentIntent.id,
      amount: paymentIntent.amount,
      reservationId: reservationId,
      expiresAt: reservation.reservationExpiry,
    });
  } catch (error) {
    console.error("Create payment intent error:", error);
    return ApiResponse.serverError(
      res,
      "Error creating payment intent",
      error.message
    );
  }
};

/**
 * Process a payment (in a real app, this would be handled by the payment gateway)
 * @route POST /api/payments/process
 */
exports.processPayment = async (req, res) => {
  try {
    const { paymentIntentId } = req.body;
    const userId = req.user.id;

    if (!paymentIntentId) {
      return ApiResponse.badRequest(res, "Payment intent ID is required");
    }

    // Process the payment with our mock payment service
    const processedPayment = await MockPaymentService.processPayment(
      paymentIntentId
    );

    if (processedPayment.status === "succeeded") {
      return ApiResponse.ok(
        res,
        {
          success: true,
          paymentIntentId,
          status: processedPayment.status,
        },
        "Payment processed successfully"
      );
    } else {
      return ApiResponse.badRequest(
        res,
        processedPayment.error?.message || "Payment failed",
        {
          success: false,
          paymentIntentId,
          status: processedPayment.status,
          error: processedPayment.error,
        }
      );
    }
  } catch (error) {
    console.error("Process payment error:", error);
    return ApiResponse.serverError(
      res,
      "Error processing payment",
      error.message
    );
  }
};

/**
 * Handle payment webhook (simulating payment gateway callback)
 * @route POST /api/payments/webhook
 */
exports.handleWebhook = async (req, res) => {
  try {
    // In a real implementation, you'd verify the webhook signature
    const { type, data } = req.body;

    if (type === "payment_intent.succeeded") {
      const paymentIntentId = data.paymentIntentId;

      // Get payment intent
      if (
        !global.paymentIntents ||
        !global.paymentIntents.has(paymentIntentId)
      ) {
        return ApiResponse.badRequest(res, "Payment intent not found");
      }

      const paymentIntent = global.paymentIntents.get(paymentIntentId);
      const { reservationId, userId } = paymentIntent.metadata;

      // Confirm the reservation using our existing service
      await BookingService.confirmReservation(
        reservationId,
        userId,
        paymentIntentId
      );

      return ApiResponse.ok(res, { received: true });
    }

    // Return 200 for any other event types we don't handle
    return ApiResponse.ok(res, { received: true });
  } catch (error) {
    console.error("Payment webhook error:", error);
    // Always return 200 to payment gateway even on errors
    // Just log the error, don't expose details
    return ApiResponse.ok(res, { received: true });
  }
};

/**
 * Confirm payment and booking
 * @route POST /api/payments/confirm
 */
exports.confirmPaymentAndBooking = async (req, res) => {
  try {
    const { paymentIntentId, reservationId } = req.body;
    const userId = req.user.id;

    if (!paymentIntentId || !reservationId) {
      return ApiResponse.badRequest(
        res,
        "Payment intent ID and reservation ID are required"
      );
    }

    // Verify the payment was successful
    const paymentSuccessful = await MockPaymentService.verifyPayment(
      paymentIntentId
    );

    if (!paymentSuccessful) {
      await prisma.booking.update({
        where: { id: reservationId },
        data: { paymentProcessing: false },
      });
      return ApiResponse.badRequest(res, "Payment verification failed");
    }

    // Confirm the reservation
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
        paymentIntentId,
      },
      "Payment confirmed and booking created successfully"
    );
  } catch (error) {
    console.error("Confirm payment error:", error);

    // Reset payment processing in case of error
    if (reservationId) {
      await prisma.booking
        .updateMany({
          where: {
            id: reservationId,
            status: "RESERVED", // Only update if still in RESERVED state
          },
          data: { paymentProcessing: false },
        })
        .catch((err) => console.error("Failed to reset payment status:", err));
    }

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

    return ApiResponse.serverError(
      res,
      "Error confirming payment",
      error.message
    );
  }
};
