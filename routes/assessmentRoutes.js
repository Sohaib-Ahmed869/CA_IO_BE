// routes/assessmentRoutes.js
const express = require("express");
const router = express.Router();
const assessmentController = require("../controllers/assessmentController");
const { authenticate, authorize } = require("../middleware/auth");

// All routes require authentication
router.use(authenticate);

// Get pending assessments (for assessors)
router.get(
  "/pending",
  authorize("assessor", "admin"),
  assessmentController.getPendingAssessments
);

// Assess a form submission
router.post(
  "/submission/:submissionId/assess",
  authorize("assessor", "admin"),
  assessmentController.assessFormSubmission
);

module.exports = router;
