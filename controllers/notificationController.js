// controllers/notificationController.js
const Notification = require("../models/notification");
const User = require("../models/user");

const notificationController = {
  // Get all notifications for the current user
  getNotifications: async (req, res) => {
    try {
      const { page = 1, limit = 20, isRead, type } = req.query;
      const userId = req.user.id;

      // Build filter
      const filter = { recipient: userId };
      if (isRead !== undefined) {
        filter.isRead = isRead === "true";
      }
      if (type) {
        filter.type = type;
      }

      // Get notifications with pagination
      const notifications = await Notification.find(filter)
        .populate("recipient", "firstName lastName email")
        .sort({ createdAt: -1 })
        .limit(limit * 1)
        .skip((page - 1) * limit);

      // Get total count
      const total = await Notification.countDocuments(filter);

      // Get unread count
      const unreadCount = await Notification.countDocuments({
        recipient: userId,
        isRead: false,
      });

      res.json({
        success: true,
        data: {
          notifications,
          pagination: {
            current: parseInt(page),
            pages: Math.ceil(total / limit),
            total,
          },
          unreadCount,
        },
      });
    } catch (error) {
      console.error("Get notifications error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching notifications",
        error: error.message,
      });
    }
  },

  // Get unread notifications count
  getUnreadCount: async (req, res) => {
    try {
      const userId = req.user.id;

      const unreadCount = await Notification.countDocuments({
        recipient: userId,
        isRead: false,
      });

      res.json({
        success: true,
        data: {
          unreadCount,
        },
      });
    } catch (error) {
      console.error("Get unread count error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching unread count",
        error: error.message,
      });
    }
  },

  // Mark a notification as read
  markAsRead: async (req, res) => {
    try {
      const { notificationId } = req.params;
      const userId = req.user.id;

      const notification = await Notification.findOne({
        _id: notificationId,
        recipient: userId,
      });

      if (!notification) {
        return res.status(404).json({
          success: false,
          message: "Notification not found",
        });
      }

      await notification.markAsRead();

      res.json({
        success: true,
        message: "Notification marked as read",
        data: notification,
      });
    } catch (error) {
      console.error("Mark notification as read error:", error);
      res.status(500).json({
        success: false,
        message: "Error marking notification as read",
        error: error.message,
      });
    }
  },

  // Mark all notifications as read
  markAllAsRead: async (req, res) => {
    try {
      const userId = req.user.id;

      const result = await Notification.updateMany(
        {
          recipient: userId,
          isRead: false,
        },
        {
          $set: {
            isRead: true,
            readAt: new Date(),
          },
        }
      );

      res.json({
        success: true,
        message: `${result.modifiedCount} notifications marked as read`,
        data: {
          markedCount: result.modifiedCount,
        },
      });
    } catch (error) {
      console.error("Mark all notifications as read error:", error);
      res.status(500).json({
        success: false,
        message: "Error marking all notifications as read",
        error: error.message,
      });
    }
  },

  // Delete a notification
  deleteNotification: async (req, res) => {
    try {
      const { notificationId } = req.params;
      const userId = req.user.id;

      const notification = await Notification.findOneAndDelete({
        _id: notificationId,
        recipient: userId,
      });

      if (!notification) {
        return res.status(404).json({
          success: false,
          message: "Notification not found",
        });
      }

      res.json({
        success: true,
        message: "Notification deleted",
        data: notification,
      });
    } catch (error) {
      console.error("Delete notification error:", error);
      res.status(500).json({
        success: false,
        message: "Error deleting notification",
        error: error.message,
      });
    }
  },

  // Delete all read notifications
  deleteAllRead: async (req, res) => {
    try {
      const userId = req.user.id;

      const result = await Notification.deleteMany({
        recipient: userId,
        isRead: true,
      });

      res.json({
        success: true,
        message: `${result.deletedCount} notifications deleted`,
        data: {
          deletedCount: result.deletedCount,
        },
      });
    } catch (error) {
      console.error("Delete all read notifications error:", error);
      res.status(500).json({
        success: false,
        message: "Error deleting read notifications",
        error: error.message,
      });
    }
  },
};

// Helper function to create a notification (can be used by other controllers)
notificationController.createNotification = async ({
  recipientId,
  type,
  title,
  message,
  relatedEntityType = null,
  relatedEntityId = null,
  metadata = {},
  priority = "medium",
  actionUrl = null,
}) => {
  try {
    const notification = await Notification.create({
      recipient: recipientId,
      type,
      title,
      message,
      relatedEntityType,
      relatedEntityId,
      metadata,
      priority,
      actionUrl,
    });

    return notification;
  } catch (error) {
    console.error("Create notification error:", error);
    return null;
  }
};

module.exports = notificationController;

