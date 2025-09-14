const express = require("express");
const router = express.Router();
const bookingController = require("../../controllers/user/booking.controller");
const { protect } = require("../../middlewares/auth");
const { isBookingOwner } = require("../../middlewares/bookingOwnerCheck");

// All routes require authentication
router.use(protect);

// Two-phase booking routes
router.post("/reserve", bookingController.createReservation);
router.get("/:id/payment", isBookingOwner, bookingController.getPaymentOptions);

// Booking routes
router.get("/", bookingController.getBookings);
router.get("/:id", isBookingOwner, bookingController.getBookingById);
router.patch("/:id/cancel", isBookingOwner, bookingController.cancelBooking);

module.exports = router;
