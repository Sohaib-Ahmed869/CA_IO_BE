// routes/adminApplicationRoutes.js
const express = require("express");
const router = express.Router();
const { authenticate, authorize } = require("../middleware/auth");

const {
  getAllApplications,
  getApplicationDetails,
  assignAssessor,
  updateApplicationStatus,
  getApplicationStats,
  getAvailableAssessors,
  getAvailableAgents,
  assignAgent,
  getFormSubmissionDetails,
  archiveApplication,
  getArchivedApplications, // ADD this
  restoreApplication, // ADD this
  updateApplicationTracking,
  getApplicationSummary,
  ceoAcknowledge,
  ceoUnacknowledge,
} = require("../controllers/adminApplicationController");

// All admin routes require authentication and admin role
router.use(authenticate);

router.use(authorize("assessor", "admin", "sales_agent"));

// Get all applications with filtering and pagination
router.get("/", getAllApplications);

// Get application statistics
router.get("/stats", getApplicationStats);

// Lightweight summary for admin board
router.get("/:applicationId/summary", getApplicationSummary);

// CEO acknowledgment routes (CEO only; optionally allow super-admin)
router.put(
  "/:applicationId/ceo-acknowledge",
  authorize("admin_with_ceo", "ceo"),
  ceoAcknowledge
);
router.delete(
  "/:applicationId/ceo-acknowledge",
  authorize("admin_with_ceo", "ceo"),
  ceoUnacknowledge
);

router.get("/archived", getArchivedApplications);
router.put("/:applicationId/restore", restoreApplication);

router.put("/:applicationId/tracking", updateApplicationTracking);

router.put("/:applicationId/archive", archiveApplication);

// Get specific application details
router.get("/:applicationId", getApplicationDetails);

// Assign assessor to application
router.put("/:applicationId/assign-assessor", assignAssessor);

// Update application status
router.put("/:applicationId/status", updateApplicationStatus);

// Get available assessors and agents
router.get("/assessors/available", getAvailableAssessors);
router.get("/agents/available", getAvailableAgents);

// Assign agent to application
router.put("/:applicationId/assign-agent", assignAgent);

router.get("/form-submission/:submissionId", getFormSubmissionDetails);

module.exports = router;
