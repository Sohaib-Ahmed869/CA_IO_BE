// routes/adminTicketRoutes.js
const express = require("express");
const router = express.Router();
const adminTicketController = require("../controllers/adminTicketController");
const { authenticate, authorize } = require("../middleware/auth");

// All routes require authentication and admin role
router.use(authenticate);
router.use(authorize("admin", "super_admin"));

// Get all tickets with filtering and pagination
router.get("/", adminTicketController.getAllTickets);

// Get ticket statistics
router.get("/stats", adminTicketController.getTicketStats);

// Get available assessors for assignment
router.get("/assessors", adminTicketController.getAvailableAssessors);

// Get specific ticket details
router.get("/:ticketId", adminTicketController.getTicketById);

// Assign ticket to assessor
router.put("/:ticketId/assign", adminTicketController.assignTicket);

// Close ticket with resolution
router.put("/:ticketId/close", adminTicketController.closeTicket);

// Auto-assign ticket based on application
router.put("/:ticketId/auto-assign", adminTicketController.autoAssignTicket);

// Update ticket status
router.put("/:ticketId/status", adminTicketController.updateTicketStatus);

// Add admin message to ticket
router.post("/:ticketId/messages", adminTicketController.addMessage);

// Get ticket messages
router.get("/:ticketId/messages", adminTicketController.getTicketMessages);

module.exports = router; 