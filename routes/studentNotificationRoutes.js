// routes/studentNotificationRoutes.js
const express = require("express");
const router = express.Router();
const studentNotificationController = require("../controllers/studentNotificationController");
const { authenticate } = require("../middleware/auth");

// Get all assessor updates for the logged-in student
router.get(
  "/updates",
  authenticate,
  studentNotificationController.getAssessorUpdates
);

// Get updates for a specific application
router.get(
  "/updates/application/:applicationId",
  authenticate,
  studentNotificationController.getApplicationUpdates
);

// Mark updates as read (optional)
router.post(
  "/updates/mark-read",
  authenticate,
  studentNotificationController.markUpdatesAsRead
);

module.exports = router;
