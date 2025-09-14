const express = require("express");
const router = express.Router();
const profileController = require("../../controllers/user/userProfile.controller");
const { protect } = require("../../middlewares/auth");

// All routes require authentication
router.use(protect);

// Profile routes
router.get("/", profileController.getProfile);
router.patch("/", profileController.updateProfile);
router.patch("/change-password", profileController.changePassword);
router.get("/stats", profileController.getUserStats);

module.exports = router;
