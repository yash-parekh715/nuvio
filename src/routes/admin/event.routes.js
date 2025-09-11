const express = require("express");
const router = express.Router();
const adminEventController = require("../../controllers/admin/event.controller");
const getEventRoutes = require("../common/event.routes");
const { protect, authorize } = require("../../middlewares/auth");
const { isEventOwner } = require("../../middlewares/ownerCheck");

// All routes require authentication and admin role
router.use(protect, authorize("ADMIN"));

router.use("/", getEventRoutes(true));

// Event routes
router.post("/", adminEventController.createEvent);
router.patch("/:id", isEventOwner, adminEventController.updateEvent);
router.delete("/:id", isEventOwner, adminEventController.deleteEvent);

module.exports = router;
