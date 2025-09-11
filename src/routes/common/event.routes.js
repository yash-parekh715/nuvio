const express = require("express");
const commonEventController = require("../../controllers/common/event.controller");

/**
 * Create router factory that generates routes with appropriate access level
 * @param {boolean} isAdmin - Whether these routes are for admin access
 */
const getEventRoutes = (isAdmin = false) => {
  const router = express.Router();

  // Common GET routes with appropriate access level
  router.get("/", commonEventController.getEvents(isAdmin));
  router.get("/:id", commonEventController.getEventById(isAdmin));

  return router;
};

module.exports = getEventRoutes;
