const ApiResponse = require("../utils/responseFormatter");
const rateLimit = require("express-rate-limit");

/**
 * Extract unique identifiers from request
 * @param {Object} req - Express request object
 * @returns {string} Combined identifiers
 */
function getRequestIdentifier(req) {
  // Combine IP with user agent and other identifiers
  const ip = req.ip || req.connection.remoteAddress || "0.0.0.0";
  const userAgent = req.headers["user-agent"] || "unknown";

  // For authenticated users, include their user ID for more accurate tracking
  const userId = req.user?.id || "anonymous";

  // Create a unique key based on these factors
  return `${ip}-${Buffer.from(userAgent)
    .toString("base64")
    .substring(0, 20)}-${userId}`;
}

// General API rate limiter
exports.apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each identifier to 100 requests per windowMs
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  keyGenerator: getRequestIdentifier,
  handler: (req, res) => {
    return ApiResponse.error(
      res,
      429,
      "Too many requests, please try again later."
    );
  },
});

// Strict limiter for auth endpoints
exports.authLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour window
  max: 5, // limit each identifier to 5 login attempts per hour
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getRequestIdentifier,
  handler: (req, res) => {
    return ApiResponse.error(
      res,
      429,
      "Too many login attempts. Please try again after an hour."
    );
  },
});

// Special limiter for account creation
exports.createAccountLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour window
  max: 3, // limit each identifier to 3 account creations per hour
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getRequestIdentifier,
  handler: (req, res) => {
    return ApiResponse.error(
      res,
      429,
      "Too many accounts created. Please try again after an hour."
    );
  },
});

// Booking reservation limiter to prevent abuse
exports.bookingLimiter = rateLimit({
  windowMs: 30 * 60 * 1000, // 30 minutes
  max: 10, // 10 reservation attempts per half hour
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getRequestIdentifier,
  handler: (req, res) => {
    return ApiResponse.error(
      res,
      429,
      "Too many reservation attempts. Please try again later."
    );
  },
});
