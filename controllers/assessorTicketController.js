// controllers/assessorTicketController.js
const Ticket = require("../models/ticket");
const TicketMessage = require("../models/ticketMessage");
const Application = require("../models/application");
const User = require("../models/user");
const logme = require("../utils/logger");
const { rtoFilter } = require("../middleware/tenant");
const socketService = require("../services/socketService");

const assessorTicketController = {
  // Get tickets assigned to the assessor
  getAssignedTickets: async (req, res) => {
    try {
      const assessorId = req.user._id;
      const { page = 1, limit = 10, status, priority, category } = req.query;

      // Build filter
      const filter = { 
        assignedTo: assessorId,
        ...rtoFilter(req.rtoId)
      };
      
      if (status && status !== "all") {
        filter.status = status;
      }
      if (priority && priority !== "all") {
        filter.priority = priority;
      }
      if (category && category !== "all") {
        filter.category = category;
      }

      // Get tickets with pagination
      const tickets = await Ticket.find(filter)
        .populate("applicationId", "certificationId")
        .populate("userId", "firstName lastName email")
        .populate("lastResponseBy", "firstName lastName")
        .populate("createdBy", "firstName lastName")
        .sort({ updatedAt: -1 })
        .limit(limit * 1)
        .skip((page - 1) * limit);

      // Get total count
      const total = await Ticket.countDocuments(filter);

      // Get message counts for each ticket
      const ticketsWithMessageCounts = await Promise.all(
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

          return {
            ...ticket.toObject(),
            messageCount,
            internalMessageCount,
          };
        })
      );

      res.json({
        success: true,
        data: {
          tickets: ticketsWithMessageCounts,
          pagination: {
            current: parseInt(page),
            pages: Math.ceil(total / limit),
            total,
          },
        },
      });
    } catch (error) {
      logme.error("Get assigned tickets error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching assigned tickets",
        error: error.message,
      });
    }
  },

  // Get specific ticket details (assessor can only see assigned tickets)
  getTicketById: async (req, res) => {
    try {
      const { ticketId } = req.params;
      const assessorId = req.user._id;

      // Get ticket with validation that it's assigned to this assessor
      const ticket = await Ticket.findOne({
        _id: ticketId,
        assignedTo: assessorId,
        ...rtoFilter(req.rtoId)
      })
        .populate("applicationId", "certificationId")
        .populate("userId", "firstName lastName email")
        .populate("lastResponseBy", "firstName lastName")
        .populate("createdBy", "firstName lastName");

      if (!ticket) {
        return res.status(404).json({
          success: false,
          message: "Ticket not found or not assigned to you",
        });
      }

      // Get all messages (including internal for assessors)
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

  // Add assessor message to ticket
  addMessage: async (req, res) => {
    try {
      const { ticketId } = req.params;
      const { message, attachments = [], isInternal = false } = req.body;
      const assessorId = req.user._id;

      // Fix isInternal if it's sent as an array or string
      let fixedIsInternal = isInternal;
      if (Array.isArray(isInternal)) {
        fixedIsInternal = false;
      } else if (typeof isInternal === 'string') {
        fixedIsInternal = isInternal === 'true' || isInternal === '1';
      } else if (typeof isInternal !== 'boolean') {
        fixedIsInternal = false;
      }

      // Validate ticket is assigned to this assessor
      const ticket = await Ticket.findOne({
        _id: ticketId,
        assignedTo: assessorId,
        ...rtoFilter(req.rtoId)
      });

      if (!ticket) {
        return res.status(404).json({
          success: false,
          message: "Ticket not found or not assigned to you",
        });
      }

      // Check if ticket is closed
      if (ticket.status === "closed") {
        return res.status(400).json({
          success: false,
          message: "Cannot add message to closed ticket",
        });
      }

      // Create message
      const ticketMessage = new TicketMessage({
        ticketId,
        senderId: assessorId,
        senderType: "assessor",
        message,
        attachments,
        isInternal: fixedIsInternal,
        rtoId: req.rtoId,
      });

      await ticketMessage.save();

      // Update ticket's last response info
      await Ticket.findByIdAndUpdate(ticketId, {
        lastResponseBy: assessorId,
        lastResponseAt: new Date(),
        updatedAt: new Date(),
      });

      // Populate message with sender info
      const populatedMessage = await TicketMessage.findById(ticketMessage._id)
        .populate("senderId", "firstName lastName email");

      logme.info("Assessor message added to ticket", {
        ticketId: ticketId,
        messageId: ticketMessage._id,
        senderId: assessorId,
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
      logme.error("Add assessor message error:", error);
      res.status(500).json({
        success: false,
        message: "Error adding message",
        error: error.message,
      });
    }
  },

  // Update ticket status (assessor can update to in_progress, resolved, or closed)
  updateTicketStatus: async (req, res) => {
    try {
      const { ticketId } = req.params;
      const { status, reason } = req.body;
      const assessorId = req.user._id;

      // Validate ticket is assigned to this assessor
      const ticket = await Ticket.findOne({
        _id: ticketId,
        assignedTo: assessorId,
        ...rtoFilter(req.rtoId)
      });

      if (!ticket) {
        return res.status(404).json({
          success: false,
          message: "Ticket not found or not assigned to you",
        });
      }

      // Assessors can only update to specific statuses
      const allowedStatuses = ["in_progress", "resolved", "closed"];
      if (!allowedStatuses.includes(status)) {
        return res.status(403).json({
          success: false,
          message: "Assessors can only update status to in_progress, resolved, or closed",
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
        senderId: assessorId,
        senderType: "assessor",
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

      logme.info("Ticket status updated by assessor", {
        ticketId: ticketId,
        previousStatus: ticket.status,
        newStatus: status,
        updatedBy: assessorId,
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

  // Get assessor's ticket statistics
  getAssessorStats: async (req, res) => {
    try {
      const assessorId = req.user._id;
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

      // Get statistics for assigned tickets
      const [
        totalAssigned,
        openAssigned,
        resolvedAssigned,
        avgResponseTime,
        categoryStats,
        priorityStats,
        statusStats,
      ] = await Promise.all([
        Ticket.countDocuments({
          assignedTo: assessorId,
          ...rtoFilter(req.rtoId),
          createdAt: { $gte: startDate }
        }),
        Ticket.countDocuments({
          assignedTo: assessorId,
          ...rtoFilter(req.rtoId),
          status: { $in: ["open", "in_progress"] },
          createdAt: { $gte: startDate }
        }),
        Ticket.countDocuments({
          assignedTo: assessorId,
          ...rtoFilter(req.rtoId),
          status: "resolved",
          createdAt: { $gte: startDate }
        }),
        Ticket.aggregate([
          { 
            $match: { 
              assignedTo: assessorId,
              ...rtoFilter(req.rtoId), 
              firstResponseTime: { $exists: true } 
            } 
          },
          { $group: { _id: null, avgTime: { $avg: "$firstResponseTime" } } }
        ]),
        Ticket.aggregate([
          { 
            $match: { 
              assignedTo: assessorId,
              ...rtoFilter(req.rtoId), 
              createdAt: { $gte: startDate } 
            } 
          },
          { $group: { _id: "$category", count: { $sum: 1 } } }
        ]),
        Ticket.aggregate([
          { 
            $match: { 
              assignedTo: assessorId,
              ...rtoFilter(req.rtoId), 
              createdAt: { $gte: startDate } 
            } 
          },
          { $group: { _id: "$priority", count: { $sum: 1 } } }
        ]),
        Ticket.aggregate([
          { 
            $match: { 
              assignedTo: assessorId,
              ...rtoFilter(req.rtoId), 
              createdAt: { $gte: startDate } 
            } 
          },
          { $group: { _id: "$status", count: { $sum: 1 } } }
        ]),
      ]);

      const avgResponse = avgResponseTime.length > 0 ? Math.round(avgResponseTime[0].avgTime) : 0;

      res.json({
        success: true,
        data: {
          period,
          totalAssigned,
          openAssigned,
          resolvedAssigned,
          avgResponseTime: avgResponse,
          categoryStats,
          priorityStats,
          statusStats,
        },
      });
    } catch (error) {
      logme.error("Get assessor stats error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching assessor statistics",
        error: error.message,
      });
    }
  },

  // Get ticket messages (assessor can see all messages for assigned tickets)
  getTicketMessages: async (req, res) => {
    try {
      const { ticketId } = req.params;
      const assessorId = req.user._id;

      // Validate ticket is assigned to this assessor
      const ticket = await Ticket.findOne({
        _id: ticketId,
        assignedTo: assessorId,
        ...(req.rtoId && { rtoId: req.rtoId })
      });

      if (!ticket) {
        return res.status(404).json({
          success: false,
          message: "Ticket not found or access denied",
        });
      }

      // Get all messages (assessor can see internal messages for assigned tickets)
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

  // Close ticket with resolution (assessor can close tickets assigned to them)
  closeTicket: async (req, res) => {
    try {
      const { ticketId } = req.params;
      const { resolution } = req.body;
      const assessorId = req.user._id;

      // Validate resolution
      if (!resolution || resolution.trim().length < 10) {
        return res.status(400).json({
          success: false,
          message: "Resolution is required and must be at least 10 characters long",
        });
      }

      // Validate ticket is assigned to this assessor
      const ticket = await Ticket.findOne({
        _id: ticketId,
        assignedTo: assessorId,
        ...rtoFilter(req.rtoId)
      });

      if (!ticket) {
        return res.status(404).json({
          success: false,
          message: "Ticket not found or not assigned to you",
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
          closedBy: assessorId,
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
        senderId: assessorId,
        senderType: "assessor",
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

      // Notify student via socket if needed
      if (ticket.userId) {
        socketService.sendNotificationToUser(ticket.userId.toString(), {
          type: "ticket_closed",
          ticketId: ticket._id,
          message: "Your ticket has been closed by the assessor",
        });
      }

      // Emit ticket status update to all users in the ticket room
      socketService.emitTicketStatusUpdate(ticketId, updatedTicket);

      logme.info("Ticket closed by assessor", {
        ticketId: ticket._id,
        assessorId: assessorId,
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
};

module.exports = assessorTicketController; 