// controllers/taskController.js
const mongoose = require("mongoose");
const Task = require("../models/task");
const User = require("../models/user");
const Application = require("../models/application");
const EmailHelpers = require("../utils/emailHelpers");
const notificationController = require("./notificationController");

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

      // Fire email and notification to assigned user if it's an assigned task
      try {
        if (task.type === "assigned" && task.assignedTo) {
          const assignedUser = await User.findById(task.assignedTo);
          const creator = await User.findById(createdBy);
          let application = null;
          if (task.connectedApplications && task.connectedApplications.length > 0) {
            application = await Application.findById(task.connectedApplications[0]).populate('certificationId');
          }
          
          // Send email
          await EmailHelpers.sendAssessorTaskAssignedEmail(assignedUser, task, creator, application);
          
          // Create notification
          const creatorName = `${creator.firstName} ${creator.lastName}`;
          const appInfo = application 
            ? ` for application ${application._id}${application.certificationId?.name ? ` (${application.certificationId.name})` : ''}`
            : '';
          
          await notificationController.createNotification({
            recipientId: task.assignedTo,
            type: "task_assigned",
            title: "New Task Assigned",
            message: `${creatorName} has assigned you a new task: "${task.title}"${appInfo}`,
            relatedEntityType: "task",
            relatedEntityId: task._id,
            metadata: {
              taskTitle: task.title,
              taskPriority: task.priority,
              dueDate: task.dueDate,
              creatorName: creatorName,
              applicationId: application?._id,
            },
            priority: task.priority === "high" ? "high" : task.priority === "low" ? "low" : "medium",
            actionUrl: `/tasks/${task._id}`,
          });
        }
      } catch (emailErr) {
        console.error("Task assignment email/notification error:", emailErr);
      }

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

      // Build filter based on user permissions
      let filter = {};

      if (userType === "admin") {
        // Admin can see all non-personal tasks + their own personal tasks
        if (userId !== "undefined") {
          console.log(userId);
          filter = {
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

      const task = await Task.findById(taskId)
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

      const prevAssignedTo = task.assignedTo?.toString();

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
          if (field === "dueDate") {
            task[field] = req.body[field] ? new Date(req.body[field]) : undefined;
          } else {
            task[field] = req.body[field];
          }
        }
      });

      // If assignedTo changed, validate user exists and active
      if (req.body.assignedTo !== undefined && task.assignedTo) {
        if (task.assignedTo.toString() !== task.createdBy.toString()) {
          const assignedUser = await User.findById(task.assignedTo);
          if (!assignedUser || !assignedUser.isActive) {
            return res.status(404).json({
              success: false,
              message: "Assigned user not found or inactive",
            });
          }
        }
      }

      // Auto-manage task type based on assignment
      if (task.assignedTo) {
        if (task.assignedTo.toString() !== task.createdBy.toString()) {
          task.type = "assigned";
        } else {
          task.type = "personal";
        }
      } else {
        task.type = "personal";
        task.assignedTo = task.createdBy;
      }

      await task.save();

      const updatedTask = await Task.findById(taskId)
        .populate("createdBy", "firstName lastName email")
        .populate("assignedTo", "firstName lastName email")
        .populate("connectedApplications");

      // If reassigned, notify assessors via email and notification
      try {
        const newAssignedTo = updatedTask.assignedTo?._id?.toString();
        if (prevAssignedTo && newAssignedTo && prevAssignedTo !== newAssignedTo) {
          const oldAssessor = await User.findById(prevAssignedTo);
          const newAssessor = await User.findById(newAssignedTo);
          const updater = await User.findById(userId);
          let application = null;
          if (updatedTask.connectedApplications && updatedTask.connectedApplications.length > 0) {
            application = await Application.findById(updatedTask.connectedApplications[0]).populate('certificationId');
          }
          
          // Send emails
          await EmailHelpers.sendAssessorTaskReassignedEmail(oldAssessor, newAssessor, updatedTask, updater, application);
          
          // Create notification for new assignee
          const updaterName = `${updater.firstName} ${updater.lastName}`;
          const appInfo = application 
            ? ` for application ${application._id}${application.certificationId?.name ? ` (${application.certificationId.name})` : ''}`
            : '';
          
          await notificationController.createNotification({
            recipientId: newAssignedTo,
            type: "task_reassigned",
            title: "Task Assigned to You",
            message: `${updaterName} has assigned you a task: "${updatedTask.title}"${appInfo}`,
            relatedEntityType: "task",
            relatedEntityId: updatedTask._id,
            metadata: {
              taskTitle: updatedTask.title,
              taskPriority: updatedTask.priority,
              dueDate: updatedTask.dueDate,
              updaterName: updaterName,
              applicationId: application?._id,
            },
            priority: updatedTask.priority === "high" ? "high" : updatedTask.priority === "low" ? "low" : "medium",
            actionUrl: `/tasks/${updatedTask._id}`,
          });
          
          // Create notification for old assignee (optional - task was reassigned)
          await notificationController.createNotification({
            recipientId: prevAssignedTo,
            type: "task_reassigned",
            title: "Task Reassigned",
            message: `The task "${updatedTask.title}" has been reassigned to another person by ${updaterName}`,
            relatedEntityType: "task",
            relatedEntityId: updatedTask._id,
            metadata: {
              taskTitle: updatedTask.title,
              updaterName: updaterName,
            },
            priority: "low",
            actionUrl: `/tasks/${updatedTask._id}`,
          });
        }
      } catch (emailErr) {
        console.error("Task reassignment email/notification error:", emailErr);
      }

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

      const isValidObjectId = mongoose.Types.ObjectId.isValid(userId);
      const userObjectId = isValidObjectId ? new mongoose.Types.ObjectId(userId) : null;

      // Build filter based on user permissions
      let filter = {};
      if (userType === "admin") {
        filter = {
          $or: [
            { type: "assigned" },
            {
              type: "personal",
              ...(userObjectId ? { createdBy: userObjectId } : {}),
            },
          ],
        };
      } else {
        filter = {
          ...(userObjectId
            ? {
                $or: [{ assignedTo: userObjectId }, { createdBy: userObjectId }],
              }
            : { _id: { $exists: false } }),
        };
      }

      const statsPipeline = [
        { $match: filter },
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 },
          },
        },
      ];

      const stats = await Task.aggregate(statsPipeline);

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
        const statusKey =
          {
            pending: "pending",
            in_progress: "inProgress",
            "in-progress": "inProgress",
            inProgress: "inProgress",
            completed: "completed",
          }[stat._id?.toString().toLowerCase()] || null;

        if (statusKey && formattedStats.hasOwnProperty(statusKey)) {
          formattedStats[statusKey] = stat.count;
        }
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
      const users = await User.find({
        isActive: true,
        userType: {
          $in: ["admin", "sales_agent", "sales_manager", "assessor"],
        },
      }).select("firstName lastName email userType");

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
      const applications = await Application.find({
        overallStatus: { $ne: "completed" },
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
