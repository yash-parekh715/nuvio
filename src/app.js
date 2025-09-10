const express = require("express");
const morgan = require("morgan");
const { connectDB } = require("./config/database");
const authRoutes = require("./routes/auth.routes");
const ApiResponse = require("./utils/responseFormatter");

// Initialize express app
const app = express();

// Middleware
app.use(express.json());
app.use(morgan("dev"));

// Routes
app.use("/api/auth", authRoutes);

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
