// routes/assessorDashboardRoutes.js
const express = require("express");
const router = express.Router();
const { authenticate, authorize } = require("../middleware/auth");

const {
  getDashboardStats,
  getFilteredApplications,
  updateAssessmentNotes,
  getPerformanceMetrics,
  markNotificationRead,
} = require("../controllers/assessorDashboardController");

// All routes require authentication and assessor role
router.use(authenticate);
router.use(authorize("assessor", "admin"));

// Get comprehensive dashboard statistics
// GET /api/assessor-dashboard/stats
router.get("/stats", getDashboardStats);

// Get filtered applications for assessor
// GET /api/assessor-dashboard/applications?filter=high_priority&search=john&sortBy=dueDate&page=1&limit=10
router.get("/applications", getFilteredApplications);

// Update assessment notes for application
// PUT /api/assessor-dashboard/application/:applicationId/notes
router.put("/application/:applicationId/notes", updateAssessmentNotes);

// Get assessor performance metrics
// GET /api/assessor-dashboard/performance?period=week
router.get("/performance", getPerformanceMetrics);

// Mark notification as read
// PUT /api/assessor-dashboard/notification/:notificationId/read
router.put("/notification/:notificationId/read", markNotificationRead);

module.exports = router;
