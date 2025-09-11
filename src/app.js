const express = require("express");
const morgan = require("morgan");

const { connectDB } = require("./config/database");
const ApiResponse = require("./utils/responseFormatter");
const { apiLimiter } = require("./middlewares/rateLimiter");

const authRoutes = require("./routes/auth.routes");
const adminRoutes = require("./routes/admin");
const userEventRoutes = require("./routes/user/event.routes");

// Initialize express app
const app = express();

// Middleware
app.use(express.json());
app.use(morgan("dev"));
app.use(apiLimiter);

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/events", userEventRoutes);

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
