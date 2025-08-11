// controllers/adminTicketController.js
const Ticket = require("../models/ticket");
const TicketMessage = require("../models/ticketMessage");
const Application = require("../models/application");
const User = require("../models/user");
const logme = require("../utils/logger");
const { rtoFilter } = require("../middleware/tenant");
const socketService = require("../services/socketService");

const adminTicketController = {
  // Get all tickets with filtering and pagination
  getAllTickets: async (req, res) => {
    try {
      const {
        page = 1,
        limit = 10,
        status,
        priority,
        category,
        assignedTo,
        search,
        sortBy = "newest",
      } = req.query;

      // Build filter
      const filter = { ...rtoFilter(req.rtoId) };
      
      if (status && status !== "all") {
        filter.status = status;
      }
      if (priority && priority !== "all") {
        filter.priority = priority;
      }
      if (category && category !== "all") {
        filter.category = category;
      }
      if (assignedTo && assignedTo !== "all") {
        filter.assignedTo = assignedTo;
      }

      // Build search query
      let searchFilter = {};
      if (search && search.trim() !== "") {
        // Search in ticket title and description
        searchFilter = {
          $or: [
            { title: { $regex: search, $options: "i" } },
            { description: { $regex: search, $options: "i" } },
          ],
        };
      }

      // Combine filters
      const finalFilter = { ...filter, ...searchFilter };

      // Build sort object
      let sortObject = {};
      switch (sortBy) {
        case "oldest":
          sortObject = { createdAt: 1 };
          break;
        case "priority":
          sortObject = { priority: -1, createdAt: -1 };
          break;
        case "status":
          sortObject = { status: 1, createdAt: -1 };
          break;
        case "updated":
          sortObject = { updatedAt: -1 };
          break;
        default: // newest
          sortObject = { createdAt: -1 };
      }

      // Get tickets with pagination
      const tickets = await Ticket.find(finalFilter)
        .populate("applicationId", "certificationId")
        .populate("userId", "firstName lastName email")
        .populate("assignedTo", "firstName lastName email")
        .populate("lastResponseBy", "firstName lastName")
        .populate("createdBy", "firstName lastName")
        .sort(sortObject)
        .limit(limit * 1)
        .skip((page - 1) * limit);

      // Get total count
      const total = await Ticket.countDocuments(finalFilter);

      // Get message counts and SLA info for each ticket
      const ticketsWithDetails = await Promise.all(
        tickets.map(async (ticket) => {
          const [messageCount, internalMessageCount] = await Promise.all([
            TicketMessage.countDocuments({
              ticketId: ticket._id,
              isInternal: false,
            }),
            TicketMessage.countDocuments({
              ticketId: ticket._id,
              isInternal: true,
            }),
          ]);

          // Calculate response time
          const firstResponse = await TicketMessage.findOne({
            ticketId: ticket._id,
            senderType: { $in: ["admin", "assessor"] },
          }).sort({ createdAt: 1 });

          let firstResponseTime = null;
          if (firstResponse) {
            firstResponseTime = Math.round(
              (firstResponse.createdAt - ticket.createdAt) / (1000 * 60)
            ); // in minutes
          }

          return {
            ...ticket.toObject(),
            messageCount,
            internalMessageCount,
            firstResponseTime,
          };
        })
      );

      res.json({
        success: true,
        data: {
          tickets: ticketsWithDetails,
          pagination: {
            current: parseInt(page),
            pages: Math.ceil(total / limit),
            total,
          },
        },
      });
    } catch (error) {
      logme.error("Get all tickets error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching tickets",
        error: error.message,
      });
    }
  },

  // Get ticket details (admin can see all tickets)
  getTicketById: async (req, res) => {
    try {
      const { ticketId } = req.params;

      // Get ticket with all messages (including internal)
      const ticket = await Ticket.findOne({
        _id: ticketId,
        ...rtoFilter(req.rtoId)
      })
        .populate("applicationId", "certificationId")
        .populate("userId", "firstName lastName email")
        .populate("assignedTo", "firstName lastName email")
        .populate("lastResponseBy", "firstName lastName")
        .populate("createdBy", "firstName lastName");

      if (!ticket) {
        return res.status(404).json({
          success: false,
          message: "Ticket not found",
        });
      }

      // Get all messages (including internal)
      const messages = await TicketMessage.find({
        ticketId: ticketId,
      })
        .populate("senderId", "firstName lastName email")
        .sort({ createdAt: 1 });

      res.json({
        success: true,
        data: {
          ticket,
          messages,
        },
      });
    } catch (error) {
      logme.error("Get ticket by ID error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching ticket",
        error: error.message,
      });
    }
  },

  // Assign ticket to assessor
  assignTicket: async (req, res) => {
    try {
      const { ticketId } = req.params;
      const { assignedTo } = req.body;
      const adminId = req.user._id;

      // Validate ticket exists
      const ticket = await Ticket.findOne({
        _id: ticketId,
        ...rtoFilter(req.rtoId)
      });

      if (!ticket) {
        return res.status(404).json({
          success: false,
          message: "Ticket not found",
        });
      }

      // Validate assignee exists and is an assessor
      if (assignedTo) {
        const assignee = await User.findOne({
          _id: assignedTo,
          userType: "assessor",
          isActive: true,
          ...(req.rtoId && { rtoId: req.rtoId })
        });

        if (!assignee) {
          return res.status(404).json({
            success: false,
            message: "Assignee not found or not an active assessor",
          });
        }
      }

      // Update ticket assignment
      const updatedTicket = await Ticket.findByIdAndUpdate(
        ticketId,
        { 
          assignedTo: assignedTo || null,
          updatedAt: new Date()
        },
        { new: true }
      )
        .populate("applicationId", "certificationId")
        .populate("userId", "firstName lastName email")
        .populate("assignedTo", "firstName lastName email");

      // Create system message for assignment
      const systemMessage = new TicketMessage({
        ticketId,
        senderId: adminId,
        senderType: "admin",
        message: assignedTo 
          ? `Ticket assigned to ${assignee.firstName} ${assignee.lastName}`
          : "Ticket unassigned",
        isSystemMessage: true,
        systemAction: "assignment",
        systemData: { 
          previousAssignee: ticket.assignedTo,
          newAssignee: assignedTo 
        },
        rtoId: req.rtoId,
      });

      await systemMessage.save();

      // Populate system message for real-time emission
      const populatedSystemMessage = await TicketMessage.findById(systemMessage._id)
        .populate("senderId", "firstName lastName email");

      // Emit real-time updates
      socketService.emitNewMessage(ticketId, populatedSystemMessage);
      socketService.emitTicketAssignmentUpdate(ticketId, updatedTicket);

      logme.info("Ticket assigned", {
        ticketId: ticketId,
        previousAssignee: ticket.assignedTo,
        newAssignee: assignedTo,
        assignedBy: adminId,
      });

      res.json({
        success: true,
        message: "Ticket assigned successfully",
        data: updatedTicket,
      });
    } catch (error) {
      logme.error("Assign ticket error:", error);
      res.status(500).json({
        success: false,
        message: "Error assigning ticket",
        error: error.message,
      });
    }
  },

  // Update ticket status
  updateTicketStatus: async (req, res) => {
    try {
      const { ticketId } = req.params;
      const { status, reason } = req.body;
      const adminId = req.user._id;

      // Validate ticket exists
      const ticket = await Ticket.findOne({
        _id: ticketId,
        ...rtoFilter(req.rtoId)
      });

      if (!ticket) {
        return res.status(404).json({
          success: false,
          message: "Ticket not found",
        });
      }

      // Update ticket status
      const updatedTicket = await Ticket.findByIdAndUpdate(
        ticketId,
        { 
          status,
          updatedAt: new Date(),
          ...(status === "resolved" && { resolvedAt: new Date() }),
          ...(status === "closed" && { closedAt: new Date() })
        },
        { new: true }
      )
        .populate("applicationId", "certificationId")
        .populate("userId", "firstName lastName email")
        .populate("assignedTo", "firstName lastName email");

      // Create system message for status change
      const systemMessage = new TicketMessage({
        ticketId,
        senderId: adminId,
        senderType: "admin",
        message: `Status changed to ${status}${reason ? `: ${reason}` : ""}`,
        isSystemMessage: true,
        systemAction: "status_change",
        systemData: { 
          previousStatus: ticket.status, 
          newStatus: status,
          reason 
        },
        rtoId: req.rtoId,
      });

      await systemMessage.save();

      // Populate system message for real-time emission
      const populatedSystemMessage = await TicketMessage.findById(systemMessage._id)
        .populate("senderId", "firstName lastName email");

      // Emit real-time updates
      socketService.emitNewMessage(ticketId, populatedSystemMessage);
      socketService.emitTicketStatusUpdate(ticketId, updatedTicket);

      logme.info("Ticket status updated", {
        ticketId: ticketId,
        previousStatus: ticket.status,
        newStatus: status,
        updatedBy: adminId,
      });

      res.json({
        success: true,
        message: "Ticket status updated successfully",
        data: updatedTicket,
      });
    } catch (error) {
      logme.error("Update ticket status error:", error);
      res.status(500).json({
        success: false,
        message: "Error updating ticket status",
        error: error.message,
      });
    }
  },

  // Add admin message to ticket
  addMessage: async (req, res) => {
    try {
      const { ticketId } = req.params;
      const { message, attachments = [], isInternal = false } = req.body;
      const adminId = req.user._id;

      // Fix isInternal if it's sent as an array or string
      let fixedIsInternal = isInternal;
      if (Array.isArray(isInternal)) {
        fixedIsInternal = false;
      } else if (typeof isInternal === 'string') {
        fixedIsInternal = isInternal === 'true' || isInternal === '1';
      } else if (typeof isInternal !== 'boolean') {
        fixedIsInternal = false;
      }

      // Validate ticket exists
      const ticket = await Ticket.findOne({
        _id: ticketId,
        ...rtoFilter(req.rtoId)
      });

      if (!ticket) {
        return res.status(404).json({
          success: false,
          message: "Ticket not found",
        });
      }

      // Create message
      const ticketMessage = new TicketMessage({
        ticketId,
        senderId: adminId,
        senderType: "admin",
        message,
        attachments,
        isInternal: fixedIsInternal,
        rtoId: req.rtoId,
      });

      await ticketMessage.save();

      // Update ticket's last response info
      await Ticket.findByIdAndUpdate(ticketId, {
        lastResponseBy: adminId,
        lastResponseAt: new Date(),
        updatedAt: new Date(),
      });

      // Populate message with sender info
      const populatedMessage = await TicketMessage.findById(ticketMessage._id)
        .populate("senderId", "firstName lastName email");

      logme.info("Admin message added to ticket", {
        ticketId: ticketId,
        messageId: ticketMessage._id,
        senderId: adminId,
        isInternal: fixedIsInternal,
      });

      // Emit real-time message to all users in the ticket room
      socketService.emitNewMessage(ticketId, populatedMessage);

      res.status(201).json({
        success: true,
        message: "Message added successfully",
        data: populatedMessage,
      });
    } catch (error) {
      logme.error("Add admin message error:", error);
      res.status(500).json({
        success: false,
        message: "Error adding message",
        error: error.message,
      });
    }
  },

  // Get ticket statistics
  getTicketStats: async (req, res) => {
    try {
      const { period = "30d" } = req.query;
      
      // Calculate date range
      const now = new Date();
      let startDate;
      
      switch (period) {
        case "7d":
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case "30d":
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
        case "90d":
          startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
          break;
        default:
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      }

      // Get statistics
      const [
        totalTickets,
        openTickets,
        resolvedTickets,
        avgResponseTime,
        categoryStats,
        priorityStats,
        statusStats,
      ] = await Promise.all([
        Ticket.countDocuments({
          ...rtoFilter(req.rtoId),
          createdAt: { $gte: startDate }
        }),
        Ticket.countDocuments({
          ...rtoFilter(req.rtoId),
          status: { $in: ["open", "in_progress"] },
          createdAt: { $gte: startDate }
        }),
        Ticket.countDocuments({
          ...rtoFilter(req.rtoId),
          status: "resolved",
          createdAt: { $gte: startDate }
        }),
        Ticket.aggregate([
          { $match: { ...rtoFilter(req.rtoId), firstResponseTime: { $exists: true } } },
          { $group: { _id: null, avgTime: { $avg: "$firstResponseTime" } } }
        ]),
        Ticket.aggregate([
          { $match: { ...rtoFilter(req.rtoId), createdAt: { $gte: startDate } } },
          { $group: { _id: "$category", count: { $sum: 1 } } }
        ]),
        Ticket.aggregate([
          { $match: { ...rtoFilter(req.rtoId), createdAt: { $gte: startDate } } },
          { $group: { _id: "$priority", count: { $sum: 1 } } }
        ]),
        Ticket.aggregate([
          { $match: { ...rtoFilter(req.rtoId), createdAt: { $gte: startDate } } },
          { $group: { _id: "$status", count: { $sum: 1 } } }
        ]),
      ]);

      const avgResponse = avgResponseTime.length > 0 ? Math.round(avgResponseTime[0].avgTime) : 0;

      res.json({
        success: true,
        data: {
          period,
          totalTickets,
          openTickets,
          resolvedTickets,
          avgResponseTime: avgResponse,
          categoryStats,
          priorityStats,
          statusStats,
        },
      });
    } catch (error) {
      logme.error("Get ticket stats error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching ticket statistics",
        error: error.message,
      });
    }
  },

  // Get ticket messages (admin can see all messages including internal)
  getTicketMessages: async (req, res) => {
    try {
      const { ticketId } = req.params;

      // Validate ticket exists and belongs to RTO
      const ticket = await Ticket.findOne({
        _id: ticketId,
        ...(req.rtoId && { rtoId: req.rtoId })
      });

      if (!ticket) {
        return res.status(404).json({
          success: false,
          message: "Ticket not found or access denied",
        });
      }

      // Get all messages (including internal messages for admin)
      const messages = await TicketMessage.find({
        ticketId: ticketId,
      })
        .populate("senderId", "firstName lastName email")
        .sort({ createdAt: 1 });

      res.json({
        success: true,
        data: messages,
      });
    } catch (error) {
      logme.error("Get ticket messages error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching ticket messages",
        error: error.message,
      });
    }
  },

  // Get available assessors for assignment
  getAvailableAssessors: async (req, res) => {
    try {
      const assessors = await User.find({
        userType: "assessor",
        isActive: true,
        ...(req.rtoId && { rtoId: req.rtoId })
      })
        .select("firstName lastName email")
        .sort({ firstName: 1 });

      res.json({
        success: true,
        data: assessors,
      });
    } catch (error) {
      logme.error("Get available assessors error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching assessors",
        error: error.message,
      });
    }
  },

  // Close ticket with resolution
  closeTicket: async (req, res) => {
    try {
      const { ticketId } = req.params;
      const { resolution } = req.body;
      const adminId = req.user._id;

      // Validate resolution
      if (!resolution || resolution.trim().length < 10) {
        return res.status(400).json({
          success: false,
          message: "Resolution is required and must be at least 10 characters long",
        });
      }

      // Validate ticket exists
      const ticket = await Ticket.findOne({
        _id: ticketId,
        ...rtoFilter(req.rtoId)
      });

      if (!ticket) {
        return res.status(404).json({
          success: false,
          message: "Ticket not found",
        });
      }

      // Check if ticket is already closed
      if (ticket.status === "closed") {
        return res.status(400).json({
          success: false,
          message: "Ticket is already closed",
        });
      }

      // Update ticket status and add resolution
      const updatedTicket = await Ticket.findByIdAndUpdate(
        ticketId,
        { 
          status: "closed",
          resolution: resolution.trim(),
          closedBy: adminId,
          updatedAt: new Date()
        },
        { new: true }
      )
        .populate("applicationId", "certificationId")
        .populate("userId", "firstName lastName email")
        .populate("assignedTo", "firstName lastName email")
        .populate("closedBy", "firstName lastName email");

      // Create system message for ticket closure
      const systemMessage = new TicketMessage({
        ticketId,
        senderId: adminId,
        senderType: "admin",
        message: `Ticket closed with resolution: ${resolution.trim()}`,
        isSystemMessage: true,
        systemAction: "status_change",
        systemData: { 
          previousStatus: ticket.status, 
          newStatus: "closed",
          resolution: resolution.trim()
        },
        rtoId: req.rtoId,
      });

      await systemMessage.save();

      // Notify via socket if needed
      if (ticket.userId) {
        socketService.sendNotificationToUser(ticket.userId.toString(), {
          type: "ticket_closed",
          ticketId: ticket._id,
          message: "Your ticket has been closed",
        });
      }

      // Emit ticket status update to all users in the ticket room
      socketService.emitTicketStatusUpdate(ticketId, updatedTicket);

      logme.info("Ticket closed successfully", {
        ticketId: ticket._id,
        adminId: adminId,
        resolution: resolution.trim()
      });

      res.json({
        success: true,
        message: "Ticket closed successfully",
        data: {
          ticketId: updatedTicket._id,
          status: updatedTicket.status,
          resolution: updatedTicket.resolution,
          closedAt: updatedTicket.closedAt,
          closedBy: updatedTicket.closedBy,
        },
      });
    } catch (error) {
      logme.error("Close ticket error:", error);
      res.status(500).json({
        success: false,
        message: "Error closing ticket",
        error: error.message,
      });
    }
  },

  // Auto-assign ticket based on application
  autoAssignTicket: async (req, res) => {
    try {
      const { ticketId } = req.params;
      const { applicationId } = req.body;
      const adminId = req.user._id;

      // Validate applicationId
      if (!applicationId) {
        return res.status(400).json({
          success: false,
          message: "Application ID is required",
        });
      }

      // Validate ticket exists
      const ticket = await Ticket.findOne({
        _id: ticketId,
        ...rtoFilter(req.rtoId)
      });

      if (!ticket) {
        return res.status(404).json({
          success: false,
          message: "Ticket not found",
        });
      }

      // Check if ticket is already assigned
      if (ticket.assignedTo) {
        return res.status(400).json({
          success: false,
          message: "Ticket is already assigned",
        });
      }

      // Find application and get assigned assessor
      const application = await Application.findOne({
        _id: applicationId,
        ...rtoFilter(req.rtoId)
      }).populate("assignedAssessor", "firstName lastName email userType isActive");

      if (!application) {
        return res.status(404).json({
          success: false,
          message: "Application not found",
        });
      }

      if (!application.assignedAssessor) {
        return res.status(400).json({
          success: false,
          message: "Application has no assigned assessor",
        });
      }

      // Validate assessor is active and available
      if (application.assignedAssessor.userType !== "assessor" || !application.assignedAssessor.isActive) {
        return res.status(400).json({
          success: false,
          message: "Assigned assessor is not available or not an assessor",
        });
      }

      // Check assessor workload (optional - can be enhanced later)
      const assessorTicketCount = await Ticket.countDocuments({
        assignedTo: application.assignedAssessor._id,
        status: { $in: ["open", "in_progress"] },
        ...rtoFilter(req.rtoId)
      });

      if (assessorTicketCount >= 10) { // Limit to 10 active tickets per assessor
        return res.status(400).json({
          success: false,
          message: "Assessor has too many active tickets",
        });
      }

      // Auto-assign ticket
      const updatedTicket = await Ticket.findByIdAndUpdate(
        ticketId,
        { 
          assignedTo: application.assignedAssessor._id,
          autoAssigned: true,
          autoAssignedAt: new Date(),
          updatedAt: new Date()
        },
        { new: true }
      )
        .populate("applicationId", "certificationId")
        .populate("userId", "firstName lastName email")
        .populate("assignedTo", "firstName lastName email");

      // Create system message for auto-assignment
      const systemMessage = new TicketMessage({
        ticketId,
        senderId: adminId,
        senderType: "admin",
        message: `Ticket auto-assigned to ${application.assignedAssessor.firstName} ${application.assignedAssessor.lastName} based on application assignment`,
        isSystemMessage: true,
        systemAction: "assignment",
        systemData: { 
          previousAssignee: null,
          newAssignee: application.assignedAssessor._id,
          autoAssigned: true,
          applicationId: applicationId
        },
        rtoId: req.rtoId,
      });

      await systemMessage.save();

      // Notify assessor via socket
      socketService.sendNotificationToUser(application.assignedAssessor._id.toString(), {
        type: "ticket_assigned",
        ticketId: ticket._id,
        message: "You have been assigned a new ticket",
      });

      // Emit ticket assignment update to all users in the ticket room
      socketService.emitTicketAssignmentUpdate(ticketId, updatedTicket);

      logme.info("Ticket auto-assigned successfully", {
        ticketId: ticket._id,
        adminId: adminId,
        assessorId: application.assignedAssessor._id,
        applicationId: applicationId
      });

      res.json({
        success: true,
        message: "Ticket auto-assigned successfully",
        data: {
          ticketId: updatedTicket._id,
          assignedTo: updatedTicket.assignedTo,
          assignedAt: updatedTicket.autoAssignedAt,
        },
      });
    } catch (error) {
      logme.error("Auto-assign ticket error:", error);
      res.status(500).json({
        success: false,
        message: "Error auto-assigning ticket",
        error: error.message,
      });
    }
  },
};

module.exports = adminTicketController; 