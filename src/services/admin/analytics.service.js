const { prisma } = require("../../config/database");
const CacheService = require("../../utils/cacheService");

class AnalyticsService {
  /**
   * Get booking analytics
   * @param {string} userId - Admin user ID
   * @param {Object} filters - Date filters
   * @returns {Promise<Object>} Analytics data
   */
  static async getBookingAnalytics(userId, filters) {
    const { startDate, endDate } = filters;

    // Create cache key based on parameters
    const cacheKey = `analytics:bookings:${userId}:${startDate || "all"}:${
      endDate || "all"
    }`;

    return CacheService.getOrSet(
      cacheKey,
      async () => {
        // Build date filter if provided
        const dateFilter = {};
        if (startDate) {
          dateFilter.gte = new Date(startDate);
        }
        if (endDate) {
          dateFilter.lte = new Date(endDate);
        }

        const whereClause = {
          event: {
            createdBy: userId,
          },
          ...(Object.keys(dateFilter).length > 0
            ? { createdAt: dateFilter }
            : {}),
        };

        // Get total bookings and revenue
        const [
          totalBookings,
          confirmedBookings,
          cancelledBookings,
          revenueResult,
          topEvents,
        ] = await prisma.$transaction([
          // Total bookings
          prisma.booking.count({
            where: whereClause,
          }),

          // Confirmed bookings
          prisma.booking.count({
            where: {
              ...whereClause,
              status: "CONFIRMED",
            },
          }),

          // Cancelled bookings
          prisma.booking.count({
            where: {
              ...whereClause,
              status: "CANCELLED",
            },
          }),

          // Total revenue
          prisma.booking.aggregate({
            where: {
              ...whereClause,
              status: "CONFIRMED",
            },
            _sum: {
              totalPrice: true,
            },
          }),

          // Top 5 events by bookings
          prisma.event.findMany({
            where: {
              bookings: {
                some: whereClause,
              },
            },
            select: {
              id: true,
              name: true,
              venueName: true,
              startTime: true,
              totalCapacity: true,
              availableCapacity: true,
              _count: {
                select: {
                  bookings: {
                    where: {
                      status: "CONFIRMED",
                      ...whereClause,
                    },
                  },
                },
              },
            },
            orderBy: {
              bookings: {
                _count: "desc",
              },
            },
            take: 5,
          }),
        ]);

        const totalRevenue = revenueResult._sum.totalPrice || 0;

        return {
          totalBookings,
          confirmedBookings,
          cancelledBookings,
          totalRevenue,
          topEvents: topEvents.map((event) => ({
            id: event.id,
            name: event.name,
            venue: event.venueName,
            startTime: event.startTime,
            totalCapacity: event.totalCapacity,
            availableCapacity: event.availableCapacity,
            bookingCount: event._count.bookings,
            utilization:
              ((event.totalCapacity - event.availableCapacity) /
                event.totalCapacity) *
              100,
          })),
        };
      },
      3600
    );
  }

  /**
   * Get event analytics
   * @param {string} eventId - Event ID
   * @returns {Promise<Object>} Event analytics
   */
  static async getEventAnalytics(eventId) {
    const [
      event,
      bookingsCount,
      confirmedBookingsCount,
      ticketsSold,
      revenueResult,
    ] = await prisma.$transaction([
      // Get event
      prisma.event.findUnique({
        where: { id: eventId },
      }),

      // Total bookings
      prisma.booking.count({
        where: { eventId },
      }),

      // Confirmed bookings
      prisma.booking.count({
        where: {
          eventId,
          status: "CONFIRMED",
        },
      }),

      // Tickets sold
      prisma.booking.aggregate({
        where: {
          eventId,
          status: "CONFIRMED",
        },
        _sum: {
          ticketCount: true,
        },
      }),

      // Total revenue
      prisma.booking.aggregate({
        where: {
          eventId,
          status: "CONFIRMED",
        },
        _sum: {
          totalPrice: true,
        },
      }),
    ]);

    if (!event) {
      throw new Error("Event not found");
    }

    const totalSold = ticketsSold._sum.ticketCount || 0;
    const totalRevenue = revenueResult._sum.totalPrice || 0;
    const utilizationRate = (totalSold / event.totalCapacity) * 100;

    return {
      eventId,
      eventName: event.name,
      totalCapacity: event.totalCapacity,
      availableCapacity: event.availableCapacity,
      totalBookings: bookingsCount,
      confirmedBookings: confirmedBookingsCount,
      ticketsSold: totalSold,
      utilizationRate: utilizationRate.toFixed(2) + "%",
      totalRevenue,
    };
  }
}

module.exports = AnalyticsService;
