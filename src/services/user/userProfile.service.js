const { prisma } = require("../../config/database");
const bcrypt = require("bcrypt");
const CacheService = require("../../utils/cacheService");

/**
 * Service for user profile management
 */
class UserProfileService {
  /**
   * Get a user's profile by ID
   * @param {string} userId - User ID
   * @returns {Promise<Object>} User profile data
   */
  static async getUserProfile(userId) {
    const cacheKey = `user:profile:${userId}`;

    return CacheService.getOrSet(
      cacheKey,
      async () => {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            createdAt: true,
            _count: {
              select: {
                bookings: true,
              },
            },
          },
        });

        if (!user) {
          throw new Error("User not found");
        }

        return user;
      },
      1800
    ); // 30-minute cache for user profiles
  }

  /**
   * Update a user's profile
   * @param {string} userId - User ID
   * @param {Object} userData - User data to update
   * @param {string} [userData.name] - User's new name
   * @param {string} [userData.email] - User's new email
   * @param {string} [userData.currentPassword] - Current password for verification
   * @param {string} [userData.newPassword] - New password to set
   * @returns {Promise<Object>} Updated user data
   */
  static async updateUserProfile(userId, userData) {
    const { name, email, currentPassword, newPassword } = userData;

    // Verify user exists
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        password: true,
      },
    });

    if (!user) {
      throw new Error("User not found");
    }

    // Check for password change
    let hashedPassword;
    if (currentPassword && newPassword) {
      // Verify current password
      const passwordValid = await bcrypt.compare(
        currentPassword,
        user.password
      );
      if (!passwordValid) {
        throw new Error("Current password is incorrect");
      }

      // Hash new password
      hashedPassword = await bcrypt.hash(newPassword, 10);
    }

    // Check if email already exists (if changing email)
    if (email && email !== user.email) {
      const existingUser = await prisma.user.findUnique({
        where: { email },
      });

      if (existingUser) {
        throw new Error("Email is already in use");
      }
    }

    // Update user profile
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(name && { name }),
        ...(email && { email }),
        ...(hashedPassword && { password: hashedPassword }),
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
      },
    });

    // Invalidate cache after update
    await CacheService.invalidate(`user:profile:${userId}`);
    await CacheService.invalidate(`user:stats:${userId}`);

    return updatedUser;
  }

  /**
   * Get user booking statistics
   * @param {string} userId - User ID
   * @returns {Promise<Object>} User booking statistics
   */
  static async getUserStats(userId) {
    const cacheKey = `user:stats:${userId}`;

    return CacheService.getOrSet(
      cacheKey,
      async () => {
        // Get booking counts by status
        const bookingStats = await prisma.booking.groupBy({
          by: ["status"],
          where: { userId },
          _count: true,
        });

        // Calculate total spent
        const totalSpent = await prisma.booking.aggregate({
          where: {
            userId,
            status: "CONFIRMED",
          },
          _sum: {
            totalPrice: true,
          },
        });

        // Get upcoming events
        const upcomingEvents = await prisma.booking.findMany({
          where: {
            userId,
            status: "CONFIRMED",
            event: {
              startTime: {
                gt: new Date(),
              },
            },
          },
          select: {
            id: true,
            eventId: true,
            ticketCount: true,
            event: {
              select: {
                name: true,
                startTime: true,
                venueName: true,
                venueCity: true,
              },
            },
          },
          orderBy: {
            event: {
              startTime: "asc",
            },
          },
          take: 5,
        });

        // Format the statistics
        const stats = {
          bookings: {
            total: 0,
            confirmed: 0,
            cancelled: 0,
            reserved: 0,
          },
          totalSpent: totalSpent._sum.totalPrice || 0,
          upcomingEvents: upcomingEvents.map((booking) => ({
            bookingId: booking.id,
            eventId: booking.eventId,
            eventName: booking.event.name,
            ticketCount: booking.ticketCount,
            startTime: booking.event.startTime,
            venue: `${booking.event.venueName}, ${booking.event.venueCity}`,
          })),
        };

        // Populate booking counts by status
        bookingStats.forEach((item) => {
          stats.bookings.total += item._count;
          if (item.status === "CONFIRMED")
            stats.bookings.confirmed = item._count;
          if (item.status === "CANCELLED")
            stats.bookings.cancelled = item._count;
          if (item.status === "RESERVED") stats.bookings.reserved = item._count;
        });

        return stats;
      },
      600
    ); // 10-minute cache
  }
   /**
   * Update a user's password
   * @param {string} userId - User ID
   * @param {string} currentPassword - Current password for verification
   * @param {string} newPassword - New password to set
   * @returns {Promise<boolean>} Success status
   */
  static async updatePassword(userId, currentPassword, newPassword) {
    if (!currentPassword || !newPassword) {
      throw new Error("Both current and new password are required");
    }

    // Verify user exists
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        password: true,
      },
    });

    if (!user) {
      throw new Error("User not found");
    }

    // Verify current password
    const passwordValid = await bcrypt.compare(currentPassword, user.password);
    if (!passwordValid) {
      throw new Error("Current password is incorrect");
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password
    await prisma.user.update({
      where: { id: userId },
      data: {
        password: hashedPassword,
      },
    });

    return true;
  }
}

module.exports = UserProfileService;
