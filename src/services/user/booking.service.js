const { prisma } = require("../../config/database");
const MockPaymentService = require("./mockPayment.service");
const { executeWithDeadlockRetry } = require("../../utils/transactionHelper");

/**
 * Service for handling booking operations with proper concurrency control
 */
class BookingService {
  /**
   * Create a temporary reservation
   * @param {string} userId - The ID of the user making the reservation
   * @param {string} eventId - The ID of the event to reserve tickets for
   * @param {number} ticketCount - The number of tickets to reserve
   * @param {number} reservationTimeMinutes - How long the reservation should last (default: 15 minutes)
   * @returns {Promise<Object>} - The created reservation
   */
  static async createReservation(
    userId,
    eventId,
    ticketCount,
    reservationTimeMinutes = 15
  ) {
    return executeWithDeadlockRetry(async (tx) => {
      // Acquire an advisory lock for this specific user-event combination
      await tx.$executeRaw`
        SELECT pg_advisory_xact_lock(
          hashtext(${userId}::text || '-' || ${eventId}::text)
        )
      `;
      // Lock the event row to prevent concurrent capacity modifications
      const event = await tx.$queryRaw`
        SELECT * FROM "events"
        WHERE id = ${eventId}
        FOR UPDATE
      `;
      if (!event.length) {
        throw new Error("Event not found");
      }
      const currentEvent = event[0];
      // Check if event is available for booking
      if (currentEvent.status !== "ACTIVE") {
        throw new Error(
          `Cannot book tickets for ${currentEvent.status.toLowerCase()} event`
        );
      }
      if (!currentEvent.is_booking_enabled) {
        throw new Error("Booking is not enabled for this event");
      }
      const currentTime = new Date();
      if (new Date(currentEvent.start_time) <= currentTime) {
        throw new Error(
          "Cannot book tickets for an event that has already started"
        );
      }
      // Check if the event has enough capacity

      const existingBookings = await tx.booking.aggregate({
        where: {
          userId,
          eventId,
          status: "CONFIRMED",
        },
        _sum: {
          ticketCount: true,
        },
      });
      // Check existing reservations that haven't expired
      const existingReservations = await tx.booking.aggregate({
        where: {
          userId,
          eventId,
          status: "RESERVED",
          reservationExpiry: { gt: new Date() },
        },
        _sum: {
          ticketCount: true,
        },
      });
      const confirmedTickets = existingBookings._sum.ticketCount || 0;
      const reservedTickets = existingReservations._sum.ticketCount || 0;
      const totalTickets = confirmedTickets + reservedTickets + ticketCount;
      // Apply ticket limit per user per event (including active reservations)
      if (totalTickets > 4) {
        throw new Error(
          `You can book a maximum of 4 tickets per event. You have ${confirmedTickets} confirmed tickets and ${reservedTickets} pending reservations.`
        );
      }

      // FIXED: Atomically update capacity with database-level constraint check
      const updateResult = await tx.$executeRaw`
      UPDATE "events"
      SET available_capacity = available_capacity - ${ticketCount}
      WHERE id = ${eventId} AND available_capacity >= ${ticketCount}
      RETURNING available_capacity
    `;

      // If no rows were updated, the capacity constraint failed
      // if (!updateResult.length) {
      //   // Get current capacity for the error message
      //   const currentCapacity = await tx.$queryRaw`
      //   SELECT available_capacity FROM "events" WHERE id = ${eventId}
      // `;
      //   throw new Error(
      //     `Only ${currentCapacity[0].available_capacity} tickets available`
      //   );
      // }
      // Calculate total price
      const totalPrice = parseFloat(currentEvent.price) * ticketCount;
      // Calculate reservation expiry time
      const expiryTime = new Date();
      expiryTime.setMinutes(expiryTime.getMinutes() + reservationTimeMinutes);
      // Create reservation with RESERVED status and expiry time
      const reservation = await tx.booking.create({
        data: {
          userId,
          eventId,
          ticketCount,
          totalPrice,
          status: "RESERVED",
          reservationExpiry: expiryTime,
        },
        include: {
          event: {
            select: {
              name: true,
              startTime: true,
              price: true,
            },
          },
        },
      });
      return {
        ...reservation,
        expiresAt: expiryTime,
      };
    });
  }

  /**
   * Confirm a reservation by ID after payment is successful
   * @param {string} reservationId - The ID of the reservation to confirm
   * @param {string} userId - The ID of the user who made the reservation
   * @param {string} paymentIntentId - Optional payment intent ID for tracking
   * @returns {Promise<Object>} - The confirmed booking
   */
  static async confirmReservation(
    reservationId,
    userId,
    paymentIntentId = null
  ) {
    return executeWithDeadlockRetry(async (tx) => {
      // Lock the booking row
      const reservation = await tx.$queryRaw`
        SELECT b.*, e.name as event_name, e.start_time
        FROM "bookings" b
        JOIN "events" e ON b.event_id = e.id
        WHERE b.id = ${reservationId}
        FOR UPDATE
      `;

      if (!reservation.length) {
        throw new Error("Reservation not found");
      }

      const currentReservation = reservation[0];

      // Check ownership
      if (currentReservation.user_id !== userId) {
        throw new Error(
          "Access denied: You can only confirm your own reservations"
        );
      }

      // Check reservation status
      if (currentReservation.status !== "RESERVED") {
        throw new Error(
          `Cannot confirm a ${currentReservation.status.toLowerCase()} booking`
        );
      }

      // Check if reservation has expired
      if (new Date(currentReservation.reservation_expiry) < new Date()) {
        throw new Error("Reservation has expired");
      }

      // Check if event has started
      if (new Date(currentReservation.start_time) <= new Date()) {
        throw new Error(
          "Cannot confirm reservation for an event that has already started"
        );
      }

      // Update booking status to CONFIRMED
      const confirmedBooking = await tx.booking.update({
        where: { id: reservationId },
        data: {
          status: "CONFIRMED",
          paymentIntentId,
          // No need to update capacity as it was already reduced during reservation
        },
        include: {
          event: {
            select: {
              id: true,
              name: true,
              startTime: true,
              venueName: true,
              venueAddress: true,
            },
          },
        },
      });

      return confirmedBooking;
    });
  }

  /**
   * Cancel a reservation or booking
   * @param {string} bookingId - The ID of the booking to cancel
   * @param {string} userId - The ID of the user who made the booking
   * @returns {Promise<Object>} - The cancelled booking
   */
  static async cancelBooking(bookingId, userId) {
    return executeWithDeadlockRetry(async (tx) => {
      // Lock the booking row
      const booking = await tx.$queryRaw`
      SELECT b.*, e.available_capacity, e.start_time
      FROM "bookings" b
      JOIN "events" e ON b.event_id = e.id
      WHERE b.id = ${bookingId}
      FOR UPDATE
    `;

      if (!booking.length) {
        throw new Error("Booking not found");
      }

      const currentBooking = booking[0];

      // Check ownership
      if (currentBooking.user_id !== userId) {
        throw new Error("Access denied: You can only cancel your own bookings");
      }

      // Check if booking is already cancelled
      if (currentBooking.status === "CANCELLED") {
        throw new Error("Booking is already cancelled");
      }

      // Check if event has already started
      const currentTime = new Date();
      if (new Date(currentBooking.start_time) <= currentTime) {
        throw new Error(
          "Cannot cancel booking for an event that has already started"
        );
      }

      // Initialize refund variables
      let refundDetails = null;
      let refundAmount = 0;
      let refundStatus = null;

      // Process refund if applicable
      if (
        currentBooking.status === "CONFIRMED" &&
        currentBooking.payment_intent_id
      ) {
        try {
          // Calculate days until event
          const daysUntilEvent = Math.ceil(
            (new Date(currentBooking.start_time) - currentTime) /
              (1000 * 60 * 60 * 24)
          );

          // Determine refund amount based on proximity to event
          if (daysUntilEvent > 7) {
            // Full refund if more than 7 days before event
            refundAmount = parseFloat(currentBooking.total_price);
            refundStatus = "FULL_REFUND";
          } else if (daysUntilEvent > 2) {
            // 50% refund if 2-7 days before event
            refundAmount = parseFloat(currentBooking.total_price) * 0.5;
            refundStatus = "PARTIAL_REFUND";
          } else {
            refundStatus = "NO_REFUND";
          }

          // Process refund if amount is greater than zero
          if (refundAmount > 0) {
            refundDetails = await MockPaymentService.processRefund(
              currentBooking.payment_intent_id,
              refundAmount,
              `Refund for booking #${bookingId}`
            );
          }
        } catch (error) {
          console.error("Refund processing error:", error);
          // Continue with cancellation even if refund fails
          refundStatus = "REFUND_FAILED";
        }
      }

      // Update booking status and refund details
      const cancelledBooking = await tx.booking.update({
        where: { id: bookingId },
        data: {
          status: "CANCELLED",
          // Only set refund fields if refund was processed
          ...(refundAmount > 0 && {
            refundAmount,
            refundId: refundDetails?.id,
            refundStatus,
            refundedAt: new Date(),
          }),
          ...(refundStatus === "NO_REFUND" && {
            refundStatus,
          }),
        },
      });

      // Restore available capacity
      await tx.event.update({
        where: { id: currentBooking.event_id },
        data: {
          availableCapacity:
            currentBooking.available_capacity + currentBooking.ticket_count,
        },
      });

      return {
        booking: cancelledBooking,
        refund: refundDetails
          ? {
              processed: true,
              amount: refundAmount,
              status: refundStatus,
              id: refundDetails.id,
            }
          : {
              processed: false,
              status: refundStatus || "NOT_APPLICABLE",
            },
      };
    });
  }

  /**
   * Clean up expired reservations
   * @returns {Promise<number>} - Number of expired reservations cleaned
   */
  static async cleanupExpiredReservations() {
    const now = new Date();
    const paymentGracePeriod = 10;

    // Calculate cutoff time for payment processing
    const paymentCutoff = new Date();
    paymentCutoff.setMinutes(paymentCutoff.getMinutes() - paymentGracePeriod);

    // Use transaction to ensure consistency
    return executeWithDeadlockRetry(async (tx) => {
      // Find expired reservations
      const expiredReservations = await tx.booking.findMany({
        where: {
          status: "RESERVED",
          reservationExpiry: { lt: now },
          OR: [
            { paymentProcessing: false },
            {
              paymentProcessing: true,
              paymentInitiatedAt: { lt: paymentCutoff },
            },
          ],
        },
        select: {
          id: true,
          eventId: true,
          ticketCount: true,
        },
      });

      if (!expiredReservations.length) {
        return 0;
      }

      // Group by eventId to update capacity efficiently
      const eventUpdates = {};
      expiredReservations.forEach((res) => {
        if (!eventUpdates[res.eventId]) {
          eventUpdates[res.eventId] = 0;
        }
        eventUpdates[res.eventId] += res.ticketCount;
      });

      // Update reservations to CANCELLED status
      await tx.booking.updateMany({
        where: {
          id: { in: expiredReservations.map((r) => r.id) },
        },
        data: {
          status: "CANCELLED",
        },
      });

      // Restore capacity for each affected event
      for (const [eventId, ticketCount] of Object.entries(eventUpdates)) {
        await tx.event.update({
          where: { id: eventId },
          data: {
            availableCapacity: {
              increment: ticketCount,
            },
          },
        });
      }

      return expiredReservations.length;
    });
  }

  /**
   * Get all bookings for a user with filtering and pagination
   * @param {string} userId - The ID of the user
   * @param {Object} options - Filter and pagination options
   * @returns {Promise<Object>} - Bookings with pagination metadata
   */
  static async getBookings(userId, options) {
    const {
      status,
      page = 1,
      limit = 10,
      timeframe,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = options;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Build filter conditions
    const where = { userId };
    if (status) where.status = status;
    if (timeframe) {
      const now = new Date();

      if (timeframe === "upcoming") {
        where.event = {
          startTime: { gte: now },
        };
      } else if (timeframe === "past") {
        where.event = {
          startTime: { lt: now },
        };
      }
    }

    let orderBy = {};
    if (sortBy === "eventDate") {
      orderBy = { event: { startTime: sortOrder } };
    } else {
      orderBy = { [sortBy]: sortOrder };
    }

    // Get bookings with pagination
    const [bookings, totalCount] = await prisma.$transaction([
      prisma.booking.findMany({
        where,
        skip,
        take: parseInt(limit),
        orderBy,
        include: {
          event: {
            select: {
              id: true,
              name: true,
              description: true,
              category: true,
              venueName: true,
              venueAddress: true,
              venueCity: true,
              venueState: true,
              venueCountry: true,
              startTime: true,
              endTime: true,
              status: true,
              price: true,
            },
          },
        },
      }),
      prisma.booking.count({ where }),
    ]);

    // Calculate pagination metadata
    const totalPages = Math.ceil(totalCount / parseInt(limit));
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    return {
      bookings,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        totalCount,
        totalPages,
        hasNextPage,
        hasPrevPage,
      },
    };
  }

  /**
   * Get a booking by ID
   * @param {string} bookingId - The ID of the booking
   * @param {string} userId - The ID of the user
   * @returns {Promise<Object>} - The booking
   */
  static async getBookingById(bookingId, userId) {
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        event: {
          select: {
            id: true,
            name: true,
            description: true,
            category: true,
            venueName: true,
            venueAddress: true,
            venueCity: true,
            venueState: true,
            venueCountry: true,
            startTime: true,
            endTime: true,
            status: true,
          },
        },
      },
    });

    if (!booking) {
      throw new Error("Booking not found");
    }

    // Check ownership
    if (booking.userId !== userId) {
      throw new Error("Access denied: You can only view your own bookings");
    }

    return booking;
  }

  /**
   * Get payment options for a reservation
   * @param {string} reservationId - The ID of the reservation
   * @param {string} userId - The ID of the user
   * @returns {Promise<Object>} - Payment options and info
   */
  static async getPaymentOptions(reservationId, userId) {
    // Find the reservation
    const reservation = await prisma.booking.findUnique({
      where: { id: reservationId },
      select: {
        id: true,
        userId: true,
        totalPrice: true,
        status: true,
        reservationExpiry: true,
        event: {
          select: {
            id: true,
            name: true,
            startTime: true,
          },
        },
      },
    });

    // Validation checks
    if (!reservation) {
      throw new Error("Reservation not found");
    }

    if (reservation.userId !== userId) {
      throw new Error("You can only access your own reservations");
    }

    if (reservation.status !== "RESERVED") {
      throw new Error("This booking is no longer in reserved status");
    }

    if (new Date(reservation.reservationExpiry) < new Date()) {
      throw new Error("This reservation has expired");
    }

    // Return payment options and info
    return {
      reservationId: reservation.id,
      eventName: reservation.event.name,
      eventDate: reservation.event.startTime,
      amount: reservation.totalPrice,
      expiresAt: reservation.reservationExpiry,
      timeLeftSeconds: Math.max(
        0,
        Math.floor(
          (new Date(reservation.reservationExpiry) - new Date()) / 1000
        )
      ),
      paymentMethods: [
        { id: "card", name: "Credit/Debit Card" },
        { id: "upi", name: "UPI" },
        { id: "netbanking", name: "Net Banking" },
      ],
    };
  }
}

module.exports = BookingService;
