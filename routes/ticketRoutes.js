// routes/ticketRoutes.js
const express = require("express");
const router = express.Router();
const ticketController = require("../controllers/ticketController");
const { authenticate } = require("../middleware/auth");

// All routes require authentication
router.use(authenticate);

// Get available applications for ticket creation
router.get("/applications", ticketController.getAvailableApplications);

// Create new ticket
router.post("/", ticketController.createTicket);

// Get user's tickets
router.get("/my-tickets", ticketController.getMyTickets);

// Get specific ticket details
router.get("/:ticketId", ticketController.getTicketById);

// Add message to ticket
router.post("/:ticketId/messages", ticketController.addMessage);

// Get ticket messages
router.get("/:ticketId/messages", ticketController.getTicketMessages);

// Update ticket status (students can only close tickets)
router.put("/:ticketId/status", ticketController.updateTicketStatus);

module.exports = router; 