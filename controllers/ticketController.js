// controllers/ticketController.js
const Ticket = require("../models/ticket");
const TicketMessage = require("../models/ticketMessage");
const Application = require("../models/application");
const User = require("../models/user");
const logme = require("../utils/logger");
const { rtoFilter } = require("../middleware/tenant");
const socketService = require("../services/socketService");

const ticketController = {
  // Create a new ticket
  createTicket: async (req, res) => {
    try {
      const {
        applicationId,
        title,
        description,
        category,
        priority = "medium",
        attachments = [],
      } = req.body;

      const userId = req.user._id;

      // Validate application belongs to user
      const application = await Application.findOne({
        _id: applicationId,
        userId: userId,
        ...(req.rtoId && { rtoId: req.rtoId })
      });

      if (!application) {
        return res.status(404).json({
          success: false,
          message: "Application not found or access denied",
        });
      }

      // Create ticket
      const ticket = new Ticket({
        applicationId,
        userId,
        title,
        description,
        category,
        priority,
        attachments,
        rtoId: req.rtoId,
        createdBy: userId,
      });

      await ticket.save();

      // Create initial message
      const initialMessage = new TicketMessage({
        ticketId: ticket._id,
        senderId: userId,
        senderType: "student",
        message: description,
        attachments,
        rtoId: req.rtoId,
      });

      await initialMessage.save();

      // Populate ticket with related data
      const populatedTicket = await Ticket.findById(ticket._id)
        .populate("applicationId", "certificationId")
        .populate("userId", "firstName lastName email")
        .populate("assignedTo", "firstName lastName email");

      logme.info("Ticket created successfully", {
        ticketId: ticket._id,
        userId: userId,
        category: category,
        priority: priority,
      });

      res.status(201).json({
        success: true,
        message: "Ticket created successfully",
        data: populatedTicket,
      });
    } catch (error) {
      logme.error("Create ticket error:", error);
      res.status(500).json({
        success: false,
        message: "Error creating ticket",
        error: error.message,
      });
    }
  },

  // Get user's tickets
  getMyTickets: async (req, res) => {
    try {
      const userId = req.user._id;
      const { page = 1, limit = 10, status, category, priority } = req.query;

      // Build filter
      const filter = { userId };
      if (status && status !== "all") {
        filter.status = status;
      }
      if (category && category !== "all") {
        filter.category = category;
      }
      if (priority && priority !== "all") {
        filter.priority = priority;
      }

      // Add RTO filtering
      if (req.rtoId) {
        filter.rtoId = req.rtoId;
      }

      // Get tickets with pagination
      const tickets = await Ticket.find(filter)
        .populate("applicationId", "certificationId")
        .populate("assignedTo", "firstName lastName email")
        .populate("lastResponseBy", "firstName lastName")
        .sort({ updatedAt: -1 })
        .limit(limit * 1)
        .skip((page - 1) * limit);

      // Get total count
      const total = await Ticket.countDocuments(filter);

      // Get message counts for each ticket
      const ticketsWithMessageCounts = await Promise.all(
        tickets.map(async (ticket) => {
          const messageCount = await TicketMessage.countDocuments({
            ticketId: ticket._id,
            isInternal: false, // Only count visible messages
          });

          return {
            ...ticket.toObject(),
            messageCount,
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
      logme.error("Get my tickets error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching tickets",
        error: error.message,
      });
    }
  },

  // Get specific ticket details
  getTicketById: async (req, res) => {
    try {
      const { ticketId } = req.params;
      const userId = req.user._id;

      // Get ticket with validation
      const ticket = await Ticket.findOne({
        _id: ticketId,
        userId: userId,
        ...(req.rtoId && { rtoId: req.rtoId })
      })
        .populate("applicationId", "certificationId")
        .populate("userId", "firstName lastName email")
        .populate("assignedTo", "firstName lastName email")
        .populate("lastResponseBy", "firstName lastName");

      if (!ticket) {
        return res.status(404).json({
          success: false,
          message: "Ticket not found or access denied",
        });
      }

      // Get messages (excluding internal messages for students)
      const messages = await TicketMessage.find({
        ticketId: ticketId,
        isInternal: false,
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

  // Add message to ticket
  addMessage: async (req, res) => {
    try {
      const { ticketId } = req.params;
      const { message, attachments = [] } = req.body;
      const userId = req.user._id;

      // Validate ticket belongs to user
      const ticket = await Ticket.findOne({
        _id: ticketId,
        userId: userId,
        ...(req.rtoId && { rtoId: req.rtoId })
      });

      if (!ticket) {
        return res.status(404).json({
          success: false,
          message: "Ticket not found or access denied",
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
        senderId: userId,
        senderType: "student",
        message,
        attachments,
        rtoId: req.rtoId,
      });

      await ticketMessage.save();

      // Update ticket's last response info
      await Ticket.findByIdAndUpdate(ticketId, {
        lastResponseBy: userId,
        lastResponseAt: new Date(),
        updatedAt: new Date(),
      });

      // Populate message with sender info
      const populatedMessage = await TicketMessage.findById(ticketMessage._id)
        .populate("senderId", "firstName lastName email");

      logme.info("Message added to ticket", {
        ticketId: ticketId,
        messageId: ticketMessage._id,
        senderId: userId,
      });

      // Emit real-time message to all users in the ticket room
      socketService.emitNewMessage(ticketId, populatedMessage);

      res.status(201).json({
        success: true,
        message: "Message added successfully",
        data: populatedMessage,
      });
    } catch (error) {
      logme.error("Add message error:", error);
      res.status(500).json({
        success: false,
        message: "Error adding message",
        error: error.message,
      });
    }
  },

  // Update ticket status (student can only close their own tickets)
  updateTicketStatus: async (req, res) => {
    try {
      const { ticketId } = req.params;
      const { status } = req.body;
      const userId = req.user._id;

      // Validate ticket belongs to user
      const ticket = await Ticket.findOne({
        _id: ticketId,
        userId: userId,
        ...(req.rtoId && { rtoId: req.rtoId })
      });

      if (!ticket) {
        return res.status(404).json({
          success: false,
          message: "Ticket not found or access denied",
        });
      }

      // Students can only close their own tickets
      if (status !== "closed") {
        return res.status(403).json({
          success: false,
          message: "Students can only close tickets",
        });
      }

      // Update ticket status
      const updatedTicket = await Ticket.findByIdAndUpdate(
        ticketId,
        { status },
        { new: true }
      )
        .populate("applicationId", "certificationId")
        .populate("userId", "firstName lastName email")
        .populate("assignedTo", "firstName lastName email");

      // Create system message for status change
      const systemMessage = new TicketMessage({
        ticketId,
        senderId: userId,
        senderType: "student",
        message: `Ticket ${status} by student`,
        isSystemMessage: true,
        systemAction: "status_change",
        systemData: { previousStatus: ticket.status, newStatus: status },
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
        updatedBy: userId,
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

  // Get ticket messages
  getTicketMessages: async (req, res) => {
    try {
      const { ticketId } = req.params;
      const userId = req.user._id;

      // Validate ticket belongs to user
      const ticket = await Ticket.findOne({
        _id: ticketId,
        userId: userId,
        ...(req.rtoId && { rtoId: req.rtoId })
      });

      if (!ticket) {
        return res.status(404).json({
          success: false,
          message: "Ticket not found or access denied",
        });
      }

      // Get messages (excluding internal messages for students)
      const messages = await TicketMessage.find({
        ticketId: ticketId,
        isInternal: false,
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

  // Get available applications for ticket creation
  getAvailableApplications: async (req, res) => {
    try {
      const userId = req.user._id;

      const applications = await Application.find({
        userId: userId,
        ...(req.rtoId && { rtoId: req.rtoId })
      })
        .populate("certificationId", "name description")
        .select("_id certificationId overallStatus createdAt")
        .sort({ createdAt: -1 });

      res.json({
        success: true,
        data: applications,
      });
    } catch (error) {
      logme.error("Get available applications error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching applications",
        error: error.message,
      });
    }
  },
};

module.exports = ticketController; 