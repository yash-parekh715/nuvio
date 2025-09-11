const express = require("express");
const router = express.Router();
const analyticsController = require("../../controllers/admin/analytics.controller");
const { protect, authorize } = require("../../middlewares/auth");
const { isEventOwner } = require("../../middlewares/ownerCheck");

// All routes require authentication and admin role
router.use(protect, authorize("ADMIN"));

// Analytics routes
router.get("/bookings", analyticsController.getBookingAnalytics);
router.get("/events/:id", isEventOwner, analyticsController.getEventAnalytics);

module.exports = router;
