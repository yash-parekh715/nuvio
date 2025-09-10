const express = require("express");
const router = express.Router();
const authController = require("../controllers/auth.controller");
const { protect } = require("../middlewares/auth");
const {
  authLimiter,
  createAccountLimiter,
} = require("../middlewares/rateLimiter");

// Public routes
router.post("/register", createAccountLimiter, authController.register);
router.post("/login", authLimiter, authController.login);

// Protected routes
router.get("/me", protect, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
