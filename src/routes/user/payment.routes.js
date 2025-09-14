const express = require("express");
const router = express.Router();
const paymentController = require("../../controllers/user/payment.controller");
const { protect } = require("../../middlewares/auth");

// All routes require authentication except webhook
router.use(protect);

// Payment routes
router.post("/create-intent", paymentController.createPaymentIntent);
router.post("/process", paymentController.processPayment);
router.post("/confirm", paymentController.confirmPaymentAndBooking);

// Webhooks don't need authentication (would come from payment provider)
router.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  (req, res, next) => {
    // Parse JSON for this specific route
    if (req.body.length) {
      req.body = JSON.parse(req.body.toString());
    }
    next();
  },
  paymentController.handleWebhook
);

module.exports = router;
