const { prisma } = require("../../config/database");
const ApiResponse = require("../../utils/responseFormatter");

/**
 * Get booking analytics
 * @route GET /api/admin/analytics/bookings
 */
exports.getBookingAnalytics = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const userId = req.user.id;

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
      ...(Object.keys(dateFilter).length > 0 ? { createdAt: dateFilter } : {}),
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

    return ApiResponse.ok(res, {
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
    });
  } catch (error) {
    console.error("Booking analytics error:", error);
    return ApiResponse.serverError(
      res,
      "Error fetching analytics",
      error.message
    );
  }
};

/**
 * Get event analytics
 * @route GET /api/admin/analytics/events/:id
 */
exports.getEventAnalytics = async (req, res) => {
  try {
    const { id } = req.params;

    const [
      event,
      bookingsCount,
      confirmedBookingsCount,
      ticketsSold,
      revenueResult,
    ] = await prisma.$transaction([
      // Get event
      prisma.event.findUnique({
        where: { id },
      }),

      // Total bookings
      prisma.booking.count({
        where: { eventId: id },
      }),

      // Confirmed bookings
      prisma.booking.count({
        where: {
          eventId: id,
          status: "CONFIRMED",
        },
      }),

      // Tickets sold
      prisma.booking.aggregate({
        where: {
          eventId: id,
          status: "CONFIRMED",
        },
        _sum: {
          ticketCount: true,
        },
      }),

      // Total revenue
      prisma.booking.aggregate({
        where: {
          eventId: id,
          status: "CONFIRMED",
        },
        _sum: {
          totalPrice: true,
        },
      }),
    ]);

    if (!event) {
      return ApiResponse.notFound(res, "Event not found");
    }

    const totalSold = ticketsSold._sum.ticketCount || 0;
    const totalRevenue = revenueResult._sum.totalPrice || 0;
    const utilizationRate = (totalSold / event.totalCapacity) * 100;

    return ApiResponse.ok(res, {
      eventId: id,
      eventName: event.name,
      totalCapacity: event.totalCapacity,
      availableCapacity: event.availableCapacity,
      totalBookings: bookingsCount,
      confirmedBookings: confirmedBookingsCount,
      ticketsSold: totalSold,
      utilizationRate: utilizationRate.toFixed(2) + "%",
      totalRevenue,
    });
  } catch (error) {
    console.error("Event analytics error:", error);
    return ApiResponse.serverError(
      res,
      "Error fetching event analytics",
      error.message
    );
  }
};
