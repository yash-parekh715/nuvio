const express = require("express");
const router = express.Router();
const eventRoutes = require("./event.routes");
const analyticsRoutes = require("./analytics.routes");

// Register admin routes
router.use("/events", eventRoutes);
router.use("/analytics", analyticsRoutes);

module.exports = router;
