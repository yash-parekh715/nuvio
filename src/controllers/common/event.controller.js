const { prisma } = require("../../config/database");
const ApiResponse = require("../../utils/responseFormatter");

/**
 * Get all events (with pagination and filtering)
 * @param {boolean} isAdmin - Whether the request is coming from an admin route
 */
exports.getEvents =
  (isAdmin = false) =>
  async (req, res) => {
    try {
      const { page = 1, limit = 10, status, category, search } = req.query;
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

      return ApiResponse.ok(res, {
        events,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          totalCount,
          totalPages,
          hasNextPage,
          hasPrevPage,
        },
      });
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

      let eventQuery;
      if (isAdmin) {
        // Admin gets full details
        eventQuery = prisma.event.findUnique({
          where: { id },
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
          where: { id },
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
        return ApiResponse.notFound(res, "Event not found");
      }

      return ApiResponse.ok(res, event);
    } catch (error) {
      console.error("Get event by ID error:", error);
      return ApiResponse.serverError(
        res,
        "Error fetching event",
        error.message
      );
    }
  };
