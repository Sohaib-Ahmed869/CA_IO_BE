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
  "/application/:applicationId/updates",
  authenticate,
  studentNotificationController.getApplicationUpdates
);

// Mark a specific notification as read
router.post(
  "/:notificationId/read",
  authenticate,
  studentNotificationController.markAsRead
);

// Mark all notifications as read
router.post(
  "/read-all",
  authenticate,
  studentNotificationController.markAllAsRead
);

module.exports = router;
