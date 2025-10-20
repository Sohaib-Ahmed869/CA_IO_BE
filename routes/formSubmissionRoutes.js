// routes/formSubmissionRoutes.js
const express = require("express");
const router = express.Router();
const formSubmissionController = require("../controllers/formSubmissionController");
const { authenticate } = require("../middleware/auth");
const applicationController = require("../controllers/applicationController");
// Get all forms for a specific application
router.get(
  "/application/:applicationId/forms",
  authenticate,
  formSubmissionController.getApplicationForms
);

// Get a specific form template for filling
router.get(
  "/application/:applicationId/form/:formTemplateId",
  authenticate,
  formSubmissionController.getFormForFilling
);

// Submit or update a form
router.post(
  "/application/:applicationId/form/:formTemplateId/submit",
  authenticate,
  formSubmissionController.submitForm
);

// Get user's form submissions for an application
router.get(
  "/application/:applicationId/submissions",
  authenticate,
  formSubmissionController.getUserFormSubmissions
);

// Resubmit a form
router.post(
  "/submission/:submissionId/resubmit",
  authenticate,
  formSubmissionController.resubmitForm
);

// Get forms requiring resubmission for an application
router.get(
  "/application/:applicationId/resubmission-required",
  authenticate,
  formSubmissionController.getResubmissionRequiredForms
);

// Get form submission details
router.get(
  "/submission/:id",
  authenticate,
  formSubmissionController.getSubmissionById
);

router.put("/:applicationId/step",authenticate, formSubmissionController.updateApplicationStep);

// LLN Test Scoring Routes
// Mark LLN test scores (assessor/admin only)
router.put(
  "/submission/:submissionId/mark-scores",
  authenticate,
  formSubmissionController.markLLNScores
);

// Get LLN test with scores (role-based visibility)
router.get(
  "/submission/:submissionId/lln-scores",
  authenticate,
  formSubmissionController.getLLNTestWithScores
);

module.exports = router;
