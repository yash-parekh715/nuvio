const ApiResponse = require("../utils/responseFormatter");
const rateLimit = require("express-rate-limit");

// General API rate limiter
exports.apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
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
  max: 5, // limit each IP to 5 login/register attempts per hour
  standardHeaders: true,
  legacyHeaders: false,
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
  max: 3, // limit each IP to 3 account creations per hour
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    return ApiResponse.error(
      res,
      429,
      "Too many accounts created from this IP. Please try again after an hour."
    );
  },
});
