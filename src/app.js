const express = require("express");
const morgan = require("morgan");

const ApiResponse = require("./utils/responseFormatter");
const { apiLimiter } = require("./middlewares/rateLimiter");
const swagger = require("./config/swagger");

const authRoutes = require("./routes/auth/auth.routes");
const adminRoutes = require("./routes/admin");
const userEventRoutes = require("./routes/user/event.routes");
const userBookingRoutes = require("./routes/user/booking.routes");
const paymentRoutes = require("./routes/user/payment.routes");
const userProfileRoutes = require("./routes/user/userProfile.routes");

// Initialize express app
const app = express();

// Middleware
app.use(express.json());
app.use(morgan("dev"));
app.use(apiLimiter);

// API Documentation - place before other routes
app.use("/api-docs", swagger.serve, swagger.setup);

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/events", userEventRoutes);
app.use("/api/bookings", userBookingRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/user/profile", userProfileRoutes);

// Add a redirect from root to docs
app.get("/", (req, res) => {
  res.redirect("/api-docs");
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);

  const errorMessage =
    process.env.NODE_ENV === "development"
      ? err.message
      : "Internal server error";
  return ApiResponse.serverError(res, "Internal server error", errorMessage);
});

module.exports = app;
