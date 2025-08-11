// routes/emailConfigRoutes.js
const express = require("express");
const router = express.Router();
const emailConfigController = require("../controllers/emailConfigController");
const { authenticate, authorize } = require("../middleware/auth");

// All routes require authentication
router.use(authenticate);

// RTO-specific email configuration routes
router.post("/", authorize("admin", "super_admin"), emailConfigController.createOrUpdateEmailConfig);
router.get("/", authorize("admin", "super_admin"), emailConfigController.getEmailConfig);
router.put("/", authorize("admin", "super_admin"), emailConfigController.createOrUpdateEmailConfig);
router.delete("/", authorize("admin", "super_admin"), emailConfigController.deleteEmailConfig);

// Test and status routes
router.post("/test", authorize("admin", "super_admin"), emailConfigController.testEmailConfig);
router.post("/send-test", authorize("admin", "super_admin"), emailConfigController.sendTestEmail);
router.get("/status", authorize("admin", "super_admin"), emailConfigController.getEmailConfigStatus);

// Admin routes for managing all email configurations
router.get("/all", authorize("super_admin"), emailConfigController.getAllEmailConfigs);

module.exports = router; 