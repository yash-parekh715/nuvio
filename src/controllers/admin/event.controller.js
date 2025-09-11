const { prisma } = require("../../config/database");
const ApiResponse = require("../../utils/responseFormatter");

/**
 * Create a new event
 * @route POST /api/admin/events
 */
exports.createEvent = async (req, res) => {
  try {
    const {
      name,
      description,
      category,
      venueName,
      venueAddress,
      venueCity,
      venueState,
      venueCountry,
      venuePincode,
      venueCoordinates,
      startTime,
      endTime,
      totalCapacity,
      price,
    } = req.body;

    // Validation
    if (
      !name ||
      !description ||
      !venueName ||
      !venueAddress ||
      !venueCity ||
      !venueState ||
      !venueCountry ||
      !venuePincode ||
      !startTime ||
      !endTime ||
      !totalCapacity ||
      !price
    ) {
      return ApiResponse.badRequest(res, "Missing required fields");
    }

    if (new Date(startTime) >= new Date(endTime)) {
      return ApiResponse.badRequest(res, "End time must be after start time");
    }

    const currentTime = new Date();
    if (new Date(startTime) < currentTime) {
      return ApiResponse.badRequest(
        res,
        "Cannot create events with start time in the past"
      );
    }

    // Create event using transaction to ensure data integrity
    const event = await prisma.$transaction(async (tx) => {
      return await tx.event.create({
        data: {
          name,
          description,
          category: category || "Uncategorized",
          venueName,
          venueAddress,
          venueCity,
          venueState,
          venueCountry,
          venuePincode,
          venueCoordinates,
          startTime: new Date(startTime),
          endTime: new Date(endTime),
          totalCapacity: parseInt(totalCapacity),
          availableCapacity: parseInt(totalCapacity), // Initially same as total
          price: parseFloat(price),
          createdBy: req.user.id, // From the authenticated admin user
          status: "ACTIVE",
        },
      });
    });

    return ApiResponse.created(res, event, "Event created successfully");
  } catch (error) {
    console.error("Create event error:", error);
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
    const {
      name,
      description,
      category,
      venueName,
      venueAddress,
      venueCity,
      venueState,
      venueCountry,
      venuePincode,
      venueCoordinates,
      startTime,
      endTime,
      totalCapacity,
      price,
      status,
      isBookingEnabled,
    } = req.body;

    if (new Date(startTime) >= new Date(endTime)) {
      return ApiResponse.badRequest(res, "End time must be after start time");
    }

    const currentTime = new Date();
    if (new Date(startTime) < currentTime) {
      return ApiResponse.badRequest(res, "Cannot set start time in the past");
    }

    // Use transaction with row-level locking to handle concurrency
    const updatedEvent = await prisma.$transaction(async (tx) => {
      // Lock the event row to prevent concurrent modifications
      const existingEvent = await tx.$queryRaw`
        SELECT * FROM "events"
        WHERE id = ${id}
        FOR UPDATE
      `;

      if (!existingEvent.length) {
        throw new Error("Event not found");
      }

      // Check if event has already started
      const currentTime = new Date();
      const eventStartTime = new Date(existingEvent[0].start_time);
      const eventEndTime = new Date(existingEvent[0].end_time);
      const currentStatus = existingEvent[0].status;
      let autoStatus = null;

      // Special handling for cancellation
      if (status === "CANCELLED") {
        // Allow cancellation regardless of whether event has started, but not if already completed
        if (currentStatus === "COMPLETED") {
          throw new Error("Cannot cancel a completed event");
        }

        if (currentStatus === "CANCELLED") {
          throw new Error("Event is already cancelled");
        }

        // For cancellation, we don't need to do other checks
        // Just update the status to CANCELLED and return
        return await tx.event.update({
          where: { id },
          data: { status: "CANCELLED" },
        });
      }

      // Check if event has already started
      if (currentTime >= eventStartTime && currentTime < eventEndTime) {
        if (currentStatus === "ACTIVE") {
          // Event has started but not yet marked
          throw new Error("Event has already started and cannot be modified");
        }
      }

      // Check if event has ended
      if (currentTime >= eventEndTime) {
        if (currentStatus !== "COMPLETED" && currentStatus !== "CANCELLED") {
          // Event has ended - automatically mark as COMPLETED
          autoStatus = "COMPLETED";
        }

        if (currentStatus === "COMPLETED" || autoStatus === "COMPLETED") {
          throw new Error("Event has ended and cannot be modified");
        }
      }

      // Block modifications to cancelled events (except for un-cancellation)
      if (currentStatus === "CANCELLED" && status !== "ACTIVE") {
        throw new Error(
          "Cannot modify cancelled events without reactivating them first"
        );
      }

      // Special validation for booking status changes
      if (isBookingEnabled !== undefined) {
        // Prevent enabling bookings for non-active events
        if (isBookingEnabled && existingEvent[0].status !== "ACTIVE") {
          throw new Error(
            `Cannot enable bookings for ${existingEvent[0].status.toLowerCase()} events`
          );
        }
      }

      // If event has ended but not marked as completed yet, update the status
      if (autoStatus === "COMPLETED") {
        return await tx.event.update({
          where: { id },
          data: { status: "COMPLETED" },
        });
      }

      // Get current bookings for capacity validation
      if (totalCapacity !== undefined) {
        const bookings = await tx.$queryRaw`
          SELECT SUM(ticket_count) as booked_count
          FROM "bookings"
          WHERE event_id = ${id} AND status = 'CONFIRMED'
        `;

        const bookedCount = parseInt(bookings[0].booked_count || 0);

        if (parseInt(totalCapacity) < bookedCount) {
          throw new Error(
            `Cannot reduce capacity below ${bookedCount} booked tickets`
          );
        }

        // Calculate new available capacity
        const capacityDiff =
          parseInt(totalCapacity) - existingEvent[0].total_capacity;
        const newAvailableCapacity =
          existingEvent[0].available_capacity + capacityDiff;

        // Update with new capacity values
        return await tx.event.update({
          where: { id },
          data: {
            ...(name && { name }),
            ...(description && { description }),
            ...(category && { category }),
            ...(venueName && { venueName }),
            ...(venueAddress && { venueAddress }),
            ...(venueCity && { venueCity }),
            ...(venueState && { venueState }),
            ...(venueCountry && { venueCountry }),
            ...(venuePincode && { venuePincode }),
            ...(venueCoordinates && { venueCoordinates }),
            ...(startTime && { startTime: new Date(startTime) }),
            ...(endTime && { endTime: new Date(endTime) }),
            ...(totalCapacity && { totalCapacity: parseInt(totalCapacity) }),
            ...(totalCapacity && { availableCapacity: newAvailableCapacity }),
            ...(price && { price: parseFloat(price) }),
            ...(status && { status }),
            ...(isBookingEnabled !== undefined && { isBookingEnabled }),
          },
        });
      } else {
        // Simple update without capacity changes
        return await tx.event.update({
          where: { id },
          data: {
            ...(name && { name }),
            ...(description && { description }),
            ...(category && { category }),
            ...(venueName && { venueName }),
            ...(venueAddress && { venueAddress }),
            ...(venueCity && { venueCity }),
            ...(venueState && { venueState }),
            ...(venueCountry && { venueCountry }),
            ...(venuePincode && { venuePincode }),
            ...(venueCoordinates && { venueCoordinates }),
            ...(startTime && { startTime: new Date(startTime) }),
            ...(endTime && { endTime: new Date(endTime) }),
            ...(price && { price: parseFloat(price) }),
            ...(status && { status }),
            ...(isBookingEnabled !== undefined && { isBookingEnabled }),
          },
        });
      }
    });

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

    const result = await prisma.$transaction(async (tx) => {
      // Lock the event row and check for existing bookings
      const event = await tx.$queryRaw`
        SELECT e.*,
        (SELECT COUNT(*) FROM "bookings" b WHERE b.event_id = e.id AND b.status = 'CONFIRMED') as booking_count
        FROM "events" e
        WHERE e.id = ${id}
        FOR UPDATE
      `;

      if (!event.length) {
        throw new Error("Event not found");
      }

      // Check if event has confirmed bookings
      if (parseInt(event[0].booking_count) > 0) {
        throw new Error("Cannot delete event with active bookings");
      }

      // Delete any cancelled bookings
      await tx.booking.deleteMany({
        where: {
          eventId: id,
          status: "CANCELLED",
        },
      });

      // Delete the event
      return await tx.event.delete({
        where: { id },
      });
    });

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
