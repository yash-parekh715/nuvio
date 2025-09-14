const express = require("express");
const router = express.Router();
const createEventRoutes = require("../common/event.routes");

// Include common GET routes configured for regular user access
router.use("/", createEventRoutes(false));



module.exports = router;
