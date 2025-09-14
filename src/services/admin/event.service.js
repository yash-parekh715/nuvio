const { prisma } = require("../../config/database");
const CacheService = require("../../utils/cacheService");
const CommonEventService = require("../common/event.service");

class EventService {
  /**
   * Create a new event
   * @param {Object} eventData - Event details
   * @param {string} userId - ID of the admin creating the event
   * @returns {Promise<Object>} Created event
   */
  static async createEvent(eventData, userId) {
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
    } = eventData;

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
      throw new Error("Missing required fields");
    }

    if (new Date(startTime) >= new Date(endTime)) {
      throw new Error("End time must be after start time");
    }

    const currentTime = new Date();
    if (new Date(startTime) < currentTime) {
      throw new Error("Cannot create events with start time in the past");
    }

    // Create event using transaction to ensure data integrity
    return await prisma.$transaction(async (tx) => {
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
          createdBy: userId,
          status: "ACTIVE",
        },
      });
    });
  }

  /**
   * Update an event with concurrency control
   * @param {string} eventId - Event ID
   * @param {Object} eventData - Updated event data
   * @returns {Promise<Object>} Updated event
   */
  static async updateEvent(eventId, eventData) {
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
    } = eventData;

    if (startTime && endTime && new Date(startTime) >= new Date(endTime)) {
      throw new Error("End time must be after start time");
    }

    if (startTime && new Date(startTime) < new Date()) {
      throw new Error("Cannot set start time in the past");
    }

    // Use transaction with row-level locking to handle concurrency
    const updatedEvent = await prisma.$transaction(async (tx) => {
      // Lock the event row to prevent concurrent modifications
      const existingEvent = await tx.$queryRaw`
        SELECT * FROM "events"
        WHERE id = ${eventId}
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
          where: { id: eventId },
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
          where: { id: eventId },
          data: { status: "COMPLETED" },
        });
      }

      // Get current bookings for capacity validation
      if (totalCapacity !== undefined) {
        const bookings = await tx.$queryRaw`
          SELECT SUM(ticket_count) as booked_count
          FROM "bookings"
          WHERE event_id = ${eventId} AND status = 'CONFIRMED'
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
          where: { id: eventId },
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
          where: { id: eventId },
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
    // Invalidate cache after successful update
    await CommonEventService.invalidateEventCache(eventId);

    return updatedEvent;
  }

  /**
   * Delete an event with concurrency control
   * @param {string} eventId - Event ID
   * @returns {Promise<Object>} Deleted event
   */
  static async deleteEvent(eventId) {
    const deletedEvent = await prisma.$transaction(async (tx) => {
      // Lock the event row and check for existing bookings
      const event = await tx.$queryRaw`
        SELECT e.*,
        (SELECT COUNT(*) FROM "bookings" b WHERE b.event_id = e.id AND b.status = 'CONFIRMED') as booking_count
        FROM "events" e
        WHERE e.id = ${eventId}
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
          eventId: eventId,
          status: "CANCELLED",
        },
      });

      // Delete the event
      return await tx.event.delete({
        where: { id: eventId },
      });
    });
    // Invalidate cache after successful deletion
    await CommonEventService.invalidateEventCache(eventId);

    // Also invalidate any list caches that might contain this event
    await CacheService.invalidatePattern("events:*");

    return deletedEvent;
  }
}

module.exports = EventService;
