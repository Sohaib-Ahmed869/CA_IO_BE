// routes/assessorTicketRoutes.js
const express = require("express");
const router = express.Router();
const assessorTicketController = require("../controllers/assessorTicketController");
const { authenticate, authorize } = require("../middleware/auth");

// All routes require authentication and assessor role
router.use(authenticate);
router.use(authorize("assessor"));

// Get tickets assigned to the assessor
router.get("/", assessorTicketController.getAssignedTickets);

// Get assessor's ticket statistics
router.get("/stats", assessorTicketController.getAssessorStats);

// Get specific ticket details
router.get("/:ticketId", assessorTicketController.getTicketById);

// Add assessor message to ticket
router.post("/:ticketId/messages", assessorTicketController.addMessage);

// Get ticket messages
router.get("/:ticketId/messages", assessorTicketController.getTicketMessages);

// Update ticket status
router.put("/:ticketId/status", assessorTicketController.updateTicketStatus);

// Close ticket with resolution
router.put("/:ticketId/close", assessorTicketController.closeTicket);

module.exports = router; 