const { prisma } = require("../../config/database");
const CacheService = require("../../utils/cacheService");

class EventService {
  /**
   * Get all events with pagination and filtering
   * @param {boolean} isAdmin - Whether to return admin or user view
   * @param {Object} filters - Filters and pagination options
   * @returns {Promise<Object>} Events with pagination metadata
   */
  static async getEvents(isAdmin = false, filters) {
    const { page = 1, limit = 10, status, category, search } = filters;
    // Create cache key based on parameters
    const cacheKey = `events:${isAdmin}:${page}:${limit}:${status || "all"}:${
      category || "all"
    }:${search || "none"}`;

    // Use cache with 5-minute TTL for events list (shorter for active data)
    return CacheService.getOrSet(
      cacheKey,
      async () => {
        const skip = (parseInt(page) - 1) * parseInt(limit);

        // Build filter conditions
        const where = {};
        if (status) where.status = status;
        if (category) where.category = category;
        if (search) {
          where.OR = [
            { name: { contains: search, mode: "insensitive" } },
            { description: { contains: search, mode: "insensitive" } },
            { venueName: { contains: search, mode: "insensitive" } },
            { venueCity: { contains: search, mode: "insensitive" } },
          ];
        }

        // Different query based on user type
        let eventsQuery;
        if (isAdmin) {
          // Admin gets full details
          eventsQuery = prisma.event.findMany({
            where,
            skip,
            take: parseInt(limit),
            orderBy: { startTime: "asc" },
            include: {
              creator: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                },
              },
              _count: {
                select: { bookings: true },
              },
            },
          });
        } else {
          // Regular users get limited details
          eventsQuery = prisma.event.findMany({
            where,
            skip,
            take: parseInt(limit),
            orderBy: { startTime: "asc" },
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
              availableCapacity: true,
              price: true,
              status: true,
              isBookingEnabled: true,
            },
          });
        }

        // Get events with pagination
        const [events, totalCount] = await prisma.$transaction([
          eventsQuery,
          prisma.event.count({ where }),
        ]);

        // Calculate pagination metadata
        const totalPages = Math.ceil(totalCount / parseInt(limit));
        const hasNextPage = page < totalPages;
        const hasPrevPage = page > 1;

        return {
          events,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            totalCount,
            totalPages,
            hasNextPage,
            hasPrevPage,
          },
        };
      },
      300
    ); // Cache for 5 minutes
  }

  /**
   * Get event by ID
   * @param {string} eventId - The event ID
   * @param {boolean} isAdmin - Whether to return admin or user view
   * @returns {Promise<Object>} Event details
   */
  static async getEventById(eventId, isAdmin = false) {
    // Cache key includes admin status since they see different data
    const cacheKey = `event:${eventId}:${isAdmin ? "admin" : "user"}`;

    return CacheService.getOrSet(
      cacheKey,
      async () => {
        let eventQuery;
        if (isAdmin) {
          // Admin gets full details
          eventQuery = prisma.event.findUnique({
            where: { id: eventId },
            include: {
              creator: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                },
              },
              _count: {
                select: { bookings: true },
              },
            },
          });
        } else {
          // Regular users get limited details
          eventQuery = prisma.event.findUnique({
            where: { id: eventId },
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
              venueCoordinates: true,
              startTime: true,
              endTime: true,
              availableCapacity: true,
              price: true,
              status: true,
              isBookingEnabled: true,
            },
          });
        }

        const event = await eventQuery;

        if (!event) {
          throw new Error("Event not found");
        }

        return event;
      },
      600
    ); // Cache for 10 minutes
  }

  /**
   * Update cache when event data changes
   * @param {string} eventId - ID of the updated event
   */
  static async invalidateEventCache(eventId) {
    // Invalidate specific event caches
    await CacheService.invalidate(`event:${eventId}:admin`);
    await CacheService.invalidate(`event:${eventId}:user`);

    // Invalidate event lists since they might contain this event
    await CacheService.invalidatePattern("events:*");
  }
}

module.exports = EventService;
