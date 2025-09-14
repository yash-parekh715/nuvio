const { prisma } = require("../../config/database");

/**
 * Mock Payment Service
 * Simulates a payment gateway for development and testing
 */
class MockPaymentService {
  /**
   * Create a payment intent for a reservation
   * @param {Object} reservation - The reservation details
   * @param {string} paymentMethod - Payment method (card, upi, etc.)
   * @returns {Promise<Object>} Payment intent object
   */
  static async createPaymentIntent(reservation, paymentMethod = "card") {
    // Generate a unique payment intent ID
    const paymentIntentId = `pi_${Date.now()}_${Math.random()
      .toString(36)
      .substring(2, 10)}`;

    // Create client secret
    const clientSecret = `${paymentIntentId}_secret_${Math.random()
      .toString(36)
      .substring(2, 15)}`;

    // Calculate expiry time (15 minutes from now)
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    // Create payment intent in database
    const paymentIntent = await prisma.paymentIntent.create({
      data: {
        id: paymentIntentId,
        clientSecret,
        amount: parseFloat(reservation.totalPrice),
        currency: "inr",
        status: "created",
        paymentMethod,
        created: new Date(),
        expiresAt,
        reservationId: reservation.id,
        metadata: {
          eventId: reservation.eventId,
          userId: reservation.userId,
          ticketCount: reservation.ticketCount,
        },
      },
    });

    return paymentIntent;
  }

  /**
   * Process a payment - this would be called by the client after payment info is collected
   * @param {string} paymentIntentId - ID of the payment intent to process
   * @param {boolean} shouldSucceed - For testing, control whether payment succeeds
   * @returns {Promise<Object>} Updated payment intent
   */
  static async processPayment(paymentIntentId, shouldSucceed = true) {
    const paymentIntent = await prisma.paymentIntent.findUnique({
      where: { id: paymentIntentId },
    });

    if (!paymentIntent) {
      throw new Error("Payment intent not found");
    }

    // Check if payment intent has expired
    if (paymentIntent.expiresAt < new Date()) {
      await prisma.paymentIntent.update({
        where: { id: paymentIntentId },
        data: {
          status: "expired",
          error: {
            code: "payment_intent_expired",
            message: "Payment intent has expired",
          },
        },
      });
      throw new Error("Payment intent has expired");
    }

    // Simulate processing time (1-2 seconds)
    await new Promise((resolve) =>
      setTimeout(resolve, 1000 + Math.random() * 1000)
    );

    // Random failure for testing (if shouldSucceed is false or 5% random failure)
    const shouldFail = !shouldSucceed || Math.random() < 0.05;
    let updateData = {};

    if (shouldFail) {
      const declineCodes = [
        "insufficient_funds",
        "expired_card",
        "invalid_cvc",
      ];
      updateData = {
        status: "failed",
        error: {
          code: "payment_failed",
          message: "Your payment could not be processed",
          declineCode: declineCodes[Math.floor(Math.random() * 3)],
        },
      };
    } else {
      updateData = {
        status: "succeeded",
      };
    }

    // Update stored payment intent
    const updatedPaymentIntent = await prisma.paymentIntent.update({
      where: { id: paymentIntentId },
      data: updateData,
    });

    return updatedPaymentIntent;
  }

  /**
   * Verify a payment - checks if payment was successful
   * @param {string} paymentIntentId - ID of the payment intent to verify
   * @returns {Promise<boolean>} True if payment was successful
   */
  static async verifyPayment(paymentIntentId) {
    // Get the stored payment intent
    const paymentIntent = await prisma.paymentIntent.findUnique({
      where: { id: paymentIntentId },
    });

    if (!paymentIntent) {
      throw new Error("Payment intent not found");
    }

    // Check if payment intent has expired
    if (paymentIntent.expiresAt < new Date()) {
      await prisma.paymentIntent.update({
        where: { id: paymentIntentId },
        data: { status: "expired" },
      });
      throw new Error("Payment intent has expired");
    }

    return paymentIntent.status === "succeeded";
  }
  /**
   * Process a refund for a payment
   * @param {string} paymentIntentId - Original payment intent ID
   * @param {number} amount - Amount to refund
   * @param {string} reason - Reason for refund
   * @returns {Promise<Object>} Refund details
   */
  static async processRefund(paymentIntentId, amount, reason = "") {
    try {
      // Verify payment intent exists
      const paymentIntent = await prisma.paymentIntent.findUnique({
        where: { id: paymentIntentId },
        include: {
          refund: true, // Include any existing refund
        },
      });

      if (!paymentIntent) {
        throw new Error("Payment intent not found");
      }

      // Verify payment was successful
      if (paymentIntent.status !== "succeeded") {
        throw new Error("Cannot refund unsuccessful payment");
      }

      // Check if a refund already exists for this payment
      if (paymentIntent.refund) {
        console.log(
          `Refund already exists for payment ${paymentIntentId}, returning existing refund`
        );
        return paymentIntent.refund;
      }

      // Create refund with unique ID
      const refundId = `re_${Date.now()}_${Math.random()
        .toString(36)
        .substring(2, 10)}`;

      // Create refund in database
      const refund = await prisma.refund.create({
        data: {
          id: refundId,
          amount,
          status: "succeeded",
          reason,
          paymentIntentId,
        },
      });

      // Simulate processing time
      await new Promise((resolve) => setTimeout(resolve, 500));

      return refund;
    } catch (error) {
      console.error("Refund processing error:", error);
      throw error;
    }
  }

  /**
   * Clean up expired payment intents to prevent database bloat
   * Can be run periodically as a scheduled job
   */
  static async cleanupExpiredPaymentIntents() {
    const now = new Date();
    // Keep expired intents for 24 hours before deletion
    const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const result = await prisma.paymentIntent.deleteMany({
      where: {
        status: "expired",
        expiresAt: { lt: cutoff },
      },
    });

    return result.count;
  }
}

module.exports = MockPaymentService;
