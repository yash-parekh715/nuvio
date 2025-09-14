// const { prisma } = require("../../config/database");
// const bcrypt = require("bcrypt");
// const ApiResponse = require("../../utils/responseFormatter");

// /**
//  * Get the current user's profile
//  * @route GET /api/user/profile
//  */
// exports.getProfile = async (req, res) => {
//   try {
//     const userId = req.user.id;

//     const user = await prisma.user.findUnique({
//       where: { id: userId },
//       select: {
//         id: true,
//         name: true,
//         email: true,
//         role: true,
//         createdAt: true,
//         _count: {
//           select: {
//             bookings: true,
//           },
//         },
//       },
//     });

//     if (!user) {
//       return ApiResponse.notFound(res, "User not found");
//     }

//     return ApiResponse.ok(res, user);
//   } catch (error) {
//     console.error("Get profile error:", error);
//     return ApiResponse.serverError(
//       res,
//       "Error fetching profile",
//       error.message
//     );
//   }
// };

// /**
//  * Update the current user's profile
//  * @route PATCH /api/user/profile
//  */
// exports.updateProfile = async (req, res) => {
//   try {
//     const userId = req.user.id;
//     const { name, email } = req.body;

//     // Validate input
//     if (!name && !email) {
//       return ApiResponse.badRequest(res, "No fields to update");
//     }

//     // Check if email already exists (if changing email)
//     if (email && email !== req.user.email) {
//       const existingUser = await prisma.user.findUnique({
//         where: { email },
//       });

//       if (existingUser) {
//         return ApiResponse.badRequest(res, "Email already in use");
//       }
//     }

//     // Update user
//     const updatedUser = await prisma.user.update({
//       where: { id: userId },
//       data: {
//         ...(name && { name }),
//         ...(email && { email }),
//       },
//       select: {
//         id: true,
//         name: true,
//         email: true,
//         role: true,
//         updatedAt: true,
//       },
//     });

//     return ApiResponse.ok(res, updatedUser, "Profile updated successfully");
//   } catch (error) {
//     console.error("Update profile error:", error);
//     return ApiResponse.serverError(
//       res,
//       "Error updating profile",
//       error.message
//     );
//   }
// };

// /**
//  * Change the current user's password
//  * @route PATCH /api/user/profile/change-password
//  */
// exports.changePassword = async (req, res) => {
//   try {
//     const userId = req.user.id;
//     const { currentPassword, newPassword } = req.body;

//     // Validate input
//     if (!currentPassword || !newPassword) {
//       return ApiResponse.badRequest(
//         res,
//         "Current password and new password are required"
//       );
//     }

//     if (newPassword.length < 8) {
//       return ApiResponse.badRequest(
//         res,
//         "New password must be at least 8 characters"
//       );
//     }

//     // Get user with password
//     const user = await prisma.user.findUnique({
//       where: { id: userId },
//     });

//     if (!user) {
//       return ApiResponse.notFound(res, "User not found");
//     }

//     // Verify current password
//     const isPasswordValid = await bcrypt.compare(
//       currentPassword,
//       user.password
//     );
//     if (!isPasswordValid) {
//       return ApiResponse.badRequest(res, "Current password is incorrect");
//     }

//     // Hash new password
//     const salt = await bcrypt.genSalt(10);
//     const hashedPassword = await bcrypt.hash(newPassword, salt);

//     // Update password
//     await prisma.user.update({
//       where: { id: userId },
//       data: {
//         password: hashedPassword,
//       },
//     });

//     return ApiResponse.ok(res, null, "Password changed successfully");
//   } catch (error) {
//     console.error("Change password error:", error);
//     return ApiResponse.serverError(
//       res,
//       "Error changing password",
//       error.message
//     );
//   }
// };

// /**
//  * Get booking stats for the current user
//  * @route GET /api/user/profile/stats
//  */
// exports.getUserStats = async (req, res) => {
//   try {
//     const userId = req.user.id;

//     const stats = await prisma.$transaction([
//       // Total bookings
//       prisma.booking.count({
//         where: { userId },
//       }),

//       // Upcoming bookings
//       prisma.booking.count({
//         where: {
//           userId,
//           status: "CONFIRMED",
//           event: {
//             startTime: { gt: new Date() },
//           },
//         },
//       }),

//       // Past events attended
//       prisma.booking.count({
//         where: {
//           userId,
//           status: "CONFIRMED",
//           event: {
//             startTime: { lt: new Date() },
//           },
//         },
//       }),

//       // Total amount spent
//       prisma.booking.aggregate({
//         where: {
//           userId,
//           status: "CONFIRMED",
//         },
//         _sum: {
//           totalPrice: true,
//         },
//       }),
//     ]);

//     return ApiResponse.ok(res, {
//       totalBookings: stats[0],
//       upcomingEvents: stats[1],
//       pastEvents: stats[2],
//       totalSpent: stats[3]._sum.totalPrice || 0,
//     });
//   } catch (error) {
//     console.error("User stats error:", error);
//     return ApiResponse.serverError(
//       res,
//       "Error fetching user stats",
//       error.message
//     );
//   }
// };
const ApiResponse = require("../../utils/responseFormatter");
const UserProfileService = require("../../services/user/userProfile.service");

/**
 * Get the current user's profile
 * @route GET /api/user/profile
 * @access Private
 * @returns {Object} User profile information
 */
exports.getProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await UserProfileService.getUserProfile(userId);
    return ApiResponse.ok(res, user);
  } catch (error) {
    console.error("Get profile error:", error);
    return ApiResponse.serverError(
      res,
      "Error fetching profile",
      error.message
    );
  }
};

/**
 * Update the current user's profile
 * @route PATCH /api/user/profile
 * @access Private
 * @param {Object} req.body - Request body
 * @param {string} [req.body.name] - New name
 * @param {string} [req.body.email] - New email
 * @param {string} [req.body.currentPassword] - Current password (required for password change)
 * @param {string} [req.body.newPassword] - New password
 * @returns {Object} Updated user profile
 */
exports.updateProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const { name, email, currentPassword, newPassword } = req.body;

    // Check if at least one field to update is provided
    if (!name && !email && !newPassword) {
      return ApiResponse.badRequest(res, "No update fields provided");
    }

    // Password change validation
    if (
      (currentPassword && !newPassword) ||
      (!currentPassword && newPassword)
    ) {
      return ApiResponse.badRequest(
        res,
        "Both current password and new password are required to change password"
      );
    }

    // Update profile using service
    const updatedUser = await UserProfileService.updateUserProfile(userId, {
      name,
      email,
      currentPassword,
      newPassword,
    });

    return ApiResponse.ok(res, updatedUser, "Profile updated successfully");
  } catch (error) {
    console.error("Update profile error:", error);
    return ApiResponse.serverError(
      res,
      "Error updating profile",
      error.message
    );
  }
};

/**
 * Get user booking statistics
 * @route GET /api/user/stats
 * @access Private
 * @returns {Object} User statistics and upcoming events
 */
exports.getUserStats = async (req, res) => {
  try {
    const userId = req.user.id;
    const stats = await UserProfileService.getUserStats(userId);
    return ApiResponse.ok(res, stats);
  } catch (error) {
    console.error("User stats error:", error);
    return ApiResponse.serverError(
      res,
      "Error fetching user stats",
      error.message
    );
  }
};

/**
 * Change the current user's password
 * @route PATCH /api/user/profile/change-password
 */
exports.changePassword = async (req, res) => {
  try {
    const userId = req.user.id;
    const { currentPassword, newPassword } = req.body;

    await UserProfileService.updatePassword(
      userId,
      currentPassword,
      newPassword
    );

    return ApiResponse.ok(res, null, "Password changed successfully");
  } catch (error) {
    console.error("Change password error:", error);
    return ApiResponse.serverError(
      res,
      "Error changing password",
      error.message
    );
  }
};
