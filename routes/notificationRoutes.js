// routes/notificationRoutes.js
const express = require("express");
const router = express.Router();
const { authenticate } = require("../middleware/auth");
const notificationController = require("../controllers/notificationController");

// All routes require authentication
router.use(authenticate);

// Get all notifications for current user
router.get("/", notificationController.getNotifications);

// Get unread count
router.get("/unread-count", notificationController.getUnreadCount);

// Mark notification as read
router.put("/:notificationId/read", notificationController.markAsRead);

// Mark all notifications as read
router.put("/read-all", notificationController.markAllAsRead);

// Delete a notification
router.delete("/:notificationId", notificationController.deleteNotification);

// Delete all read notifications
router.delete("/read/all", notificationController.deleteAllRead);

module.exports = router;

