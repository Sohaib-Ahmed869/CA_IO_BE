// controllers/taskController.js
const Task = require("../models/task");
const User = require("../models/user");
const Application = require("../models/application");

const taskController = {
  // Create a new task
  createTask: async (req, res) => {
    try {
      const {
        title,
        description,
        priority = "medium",
        type,
        assignedTo,
        dueDate,
        tags = [],
        connectedApplications = [],
        checklist = [],
      } = req.body;

      const createdBy = req.user.id;

      // If type is personal, assignedTo should be the creator
      const finalAssignedTo = type === "personal" ? createdBy : assignedTo;

      // Verify assigned user exists
      if (type === "assigned" && assignedTo) {
        const assignedUser = await User.findById(assignedTo);
        if (!assignedUser || !assignedUser.isActive) {
          return res.status(404).json({
            success: false,
            message: "Assigned user not found or inactive",
          });
        }
      }

      // Verify connected applications exist
      if (connectedApplications.length > 0) {
        const applications = await Application.find({
          _id: { $in: connectedApplications },
        });
        if (applications.length !== connectedApplications.length) {
          return res.status(404).json({
            success: false,
            message: "One or more connected applications not found",
          });
        }
      }

      const task = await Task.create({
        title,
        description,
        priority,
        type,
        createdBy,
        assignedTo: finalAssignedTo,
        rtoId: req.rtoId, // Add RTO context
        dueDate: dueDate ? new Date(dueDate) : undefined,
        tags,
        connectedApplications,
        checklist,
      });

      const populatedTask = await Task.findById(task._id)
        .populate("createdBy", "firstName lastName email")
        .populate("assignedTo", "firstName lastName email")
        .populate(
          "connectedApplications",
          "userId certificationId overallStatus"
        )
        .populate({
          path: "connectedApplications",
          populate: [
            { path: "userId", select: "firstName lastName email" },
            { path: "certificationId", select: "name" },
          ],
        });

      res.status(201).json({
        success: true,
        message: "Task created successfully",
        data: populatedTask,
      });
    } catch (error) {
      console.error("Create task error:", error);
      res.status(500).json({
        success: false,
        message: "Error creating task",
      });
    }
  },

  // Get tasks (with filtering based on user role)
  getTasks: async (req, res) => {
    try {
      const {
        page = 1,
        limit = 20,
        status,
        priority,
        type,
        assignedTo,
        search,
        sortBy = "newest",
      } = req.query;

      const userId = req.user.id;
      const userType = req.user.userType;

      // Build filter based on user permissions and RTO
      let filter = {};

      // Add RTO filtering
      if (req.rtoId) {
        filter.rtoId = req.rtoId;
      }

      if (userType === "admin") {
        // Admin can see all non-personal tasks + their own personal tasks
        if (userId !== "undefined") {
          console.log(userId);
          filter = {
            ...filter,
            $or: [
              { type: "assigned" }, // All assigned tasks
              { type: "personal", createdBy: userId }, // Own personal tasks
            ],
          };
        }
      } else {
        // Regular users can only see:
        // 1. Tasks assigned to them
        // 2. Tasks created by them
        if (userId !== "undefined") {
          filter = {
            ...filter,
            $or: [{ assignedTo: userId }, { createdBy: userId }],
          };
        }
      }

      // Apply additional filters
      if (status && status !== "all" && status !== "undefined") {
        filter.status = status;
      }
      if (priority && priority !== "all" && priority !== "undefined") {
        filter.priority = priority;
      }
      if (type && type !== "all" && type !== "undefined") {
        filter.type = type;
      }
      if (assignedTo && assignedTo !== "all" && assignedTo !== "undefined") {
        filter.assignedTo = assignedTo;
      }

      // Sort options
      let sortOptions = {};
      switch (sortBy) {
        case "oldest":
          sortOptions = { createdAt: 1 };
          break;
        case "dueDate":
          sortOptions = { dueDate: 1 };
          break;
        case "priority":
          sortOptions = { priority: -1, createdAt: -1 };
          break;
        default: // newest
          sortOptions = { createdAt: -1 };
      }

      const tasks = await Task.find(filter)
        .populate("createdBy", "firstName lastName email")
        .populate("assignedTo", "firstName lastName email")
        .populate(
          "connectedApplications",
          "userId certificationId overallStatus"
        )
        .populate({
          path: "connectedApplications",
          populate: [
            { path: "userId", select: "firstName lastName email" },
            { path: "certificationId", select: "name" },
          ],
        })
        .sort(sortOptions)
        .limit(limit * 1)
        .skip((page - 1) * limit);

      const total = await Task.countDocuments(filter);

      console.log(tasks);

      res.json({
        success: true,
        data: {
          tasks,
          pagination: {
            current: parseInt(page),
            pages: Math.ceil(total / limit),
            total,
          },
        },
      });
    } catch (error) {
      console.error("Get tasks error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching tasks",
      });
    }
  },

  // Get task by ID
  getTaskById: async (req, res) => {
    try {
      const { taskId } = req.params;
      const userId = req.user.id;
      const userType = req.user.userType;

      // Build query with RTO filtering
      const query = { _id: taskId };
      if (req.rtoId) {
        query.rtoId = req.rtoId;
      }

      const task = await Task.findOne(query)
        .populate("createdBy", "firstName lastName email")
        .populate("assignedTo", "firstName lastName email")
        .populate("connectedApplications")
        .populate({
          path: "connectedApplications",
          populate: [
            { path: "userId", select: "firstName lastName email" },
            { path: "certificationId", select: "name" },
          ],
        })
        .populate("comments.createdBy", "firstName lastName email")
        .populate("checklist.completedBy", "firstName lastName email");

      if (!task) {
        return res.status(404).json({
          success: false,
          message: "Task not found",
        });
      }

      // Check permissions
      const canView =
        (userType === "admin" && task.type === "assigned") ||
        task.assignedTo._id.toString() === userId ||
        task.createdBy._id.toString() === userId;

      if (!canView) {
        return res.status(403).json({
          success: false,
          message: "Access denied",
        });
      }

      res.json({
        success: true,
        data: task,
      });
    } catch (error) {
      console.error("Get task by ID error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching task",
      });
    }
  },

  // Update task status
  updateTaskStatus: async (req, res) => {
    try {
      const { taskId } = req.params;
      const { status } = req.body;
      const userId = req.user.id;
      const userType = req.user.userType;

      const task = await Task.findById(taskId);
      if (!task) {
        return res.status(404).json({
          success: false,
          message: "Task not found",
        });
      }

      // Check permissions: Only assigned user or admin can change status
      const canUpdate =
        userType === "admin" || task.assignedTo.toString() === userId;

      if (!canUpdate) {
        return res.status(403).json({
          success: false,
          message: "Only the assigned user or admin can update task status",
        });
      }

      // Update task
      task.status = status;
      if (status === "completed") {
        task.completedAt = new Date();
        task.completedBy = userId;
      } else {
        task.completedAt = undefined;
        task.completedBy = undefined;
      }

      await task.save();

      const updatedTask = await Task.findById(taskId)
        .populate("createdBy", "firstName lastName email")
        .populate("assignedTo", "firstName lastName email")
        .populate("completedBy", "firstName lastName email");

      res.json({
        success: true,
        message: "Task status updated successfully",
        data: updatedTask,
      });
    } catch (error) {
      console.error("Update task status error:", error);
      res.status(500).json({
        success: false,
        message: "Error updating task status",
      });
    }
  },

  // Update task
  updateTask: async (req, res) => {
    try {
      const { taskId } = req.params;
      const userId = req.user.id;
      const userType = req.user.userType;

      const task = await Task.findById(taskId);
      if (!task) {
        return res.status(404).json({
          success: false,
          message: "Task not found",
        });
      }

      // Check permissions: Only creator or admin can edit task details
      const canEdit =
        userType === "admin" || task.createdBy.toString() === userId;

      if (!canEdit) {
        return res.status(403).json({
          success: false,
          message: "Only the creator or admin can edit task details",
        });
      }

      // Update allowed fields
      const allowedUpdates = [
        "title",
        "description",
        "priority",
        "dueDate",
        "tags",
        "connectedApplications",
        "assignedTo",
      ];

      allowedUpdates.forEach((field) => {
        if (req.body[field] !== undefined) {
          task[field] = req.body[field];
        }
      });

      await task.save();

      const updatedTask = await Task.findById(taskId)
        .populate("createdBy", "firstName lastName email")
        .populate("assignedTo", "firstName lastName email")
        .populate("connectedApplications");

      res.json({
        success: true,
        message: "Task updated successfully",
        data: updatedTask,
      });
    } catch (error) {
      console.error("Update task error:", error);
      res.status(500).json({
        success: false,
        message: "Error updating task",
      });
    }
  },

  // Delete task
  deleteTask: async (req, res) => {
    try {
      const { taskId } = req.params;
      const userId = req.user.id;
      const userType = req.user.userType;

      const task = await Task.findById(taskId);
      if (!task) {
        return res.status(404).json({
          success: false,
          message: "Task not found",
        });
      }

      // Check permissions: Only creator or admin can delete
      const canDelete =
        userType === "admin" || task.createdBy.toString() === userId;

      if (!canDelete) {
        return res.status(403).json({
          success: false,
          message: "Only the creator or admin can delete tasks",
        });
      }

      await Task.findByIdAndDelete(taskId);

      res.json({
        success: true,
        message: "Task deleted successfully",
      });
    } catch (error) {
      console.error("Delete task error:", error);
      res.status(500).json({
        success: false,
        message: "Error deleting task",
      });
    }
  },

  // Get task statistics
  getTaskStats: async (req, res) => {
    try {
      const userId = req.user.id;
      const userType = req.user.userType;

      // Build filter based on user permissions and RTO
      let filter = {};
      
      // Add RTO filtering
      if (req.rtoId) {
        filter.rtoId = req.rtoId;
      }
      
      if (userType === "admin") {
        filter = {
          ...filter,
          $or: [{ type: "assigned" }, { type: "personal", createdBy: userId }],
        };
      } else {
        filter = {
          ...filter,
          $or: [{ assignedTo: userId }, { createdBy: userId }],
        };
      }

      const stats = await Task.aggregate([
        { $match: filter },
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 },
          },
        },
      ]);

      const overdue = await Task.countDocuments({
        ...filter,
        dueDate: { $lt: new Date() },
        status: { $ne: "completed" },
      });

      const total = await Task.countDocuments(filter);

      // Format stats
      const formattedStats = {
        total,
        pending: 0,
        inProgress: 0,
        completed: 0,
        overdue,
      };

      stats.forEach((stat) => {
        if (stat._id === "pending") formattedStats.pending = stat.count;
        if (stat._id === "in_progress") formattedStats.inProgress = stat.count;
        if (stat._id === "completed") formattedStats.completed = stat.count;
      });

      res.json({
        success: true,
        data: formattedStats,
      });
    } catch (error) {
      console.error("Get task stats error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching task statistics",
      });
    }
  },

  // Add comment to task
  addComment: async (req, res) => {
    try {
      const { taskId } = req.params;
      const { text } = req.body;
      const userId = req.user.id;

      const task = await Task.findById(taskId);
      if (!task) {
        return res.status(404).json({
          success: false,
          message: "Task not found",
        });
      }

      // Check if user can access this task
      const canAccess =
        (req.user.userType === "admin" && task.type === "assigned") ||
        task.assignedTo.toString() === userId ||
        task.createdBy.toString() === userId;

      if (!canAccess) {
        return res.status(403).json({
          success: false,
          message: "Access denied",
        });
      }

      task.comments.push({
        text,
        createdBy: userId,
      });

      await task.save();

      const updatedTask = await Task.findById(taskId).populate(
        "comments.createdBy",
        "firstName lastName email"
      );

      res.json({
        success: true,
        message: "Comment added successfully",
        data: updatedTask.comments[updatedTask.comments.length - 1],
      });
    } catch (error) {
      console.error("Add comment error:", error);
      res.status(500).json({
        success: false,
        message: "Error adding comment",
      });
    }
  },

  // Get available users for task assignment
  getAvailableUsers: async (req, res) => {
    try {
      const query = {
        isActive: true,
        userType: {
          $in: ["admin", "sales_agent", "sales_manager", "assessor"],
        },
      };

      // Add RTO filtering
      if (req.rtoId) {
        query.rtoId = req.rtoId;
      }

      const users = await User.find(query).select("firstName lastName email userType");

      res.json({
        success: true,
        data: users,
      });
    } catch (error) {
      console.error("Get available users error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching available users",
      });
    }
  },

  getAvailableApplications: async (req, res) => {
    try {
      const { rtoFilter } = require("../middleware/tenant");
      
      const applications = await Application.find({
        overallStatus: { $ne: "completed" },
        ...rtoFilter(req.rtoId)
      })
        .populate("userId", "firstName lastName email")
        .populate("certificationId", "name")
        .select("userId certificationId overallStatus");

      res.json({
        success: true,
        data: applications,
      });
    } catch (error) {
      console.error("Get available applications error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching available applications",
      });
    }
  },
};

module.exports = taskController;
