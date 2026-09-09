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

// Extend or clear a resubmission deadline that has passed or is too tight,
// so an assessor can unblock a student without a database edit.
router.patch(
  "/submission/:submissionId/resubmission-deadline",
  authorize("assessor", "admin"),
  assessmentController.updateResubmissionDeadline
);

module.exports = router;
