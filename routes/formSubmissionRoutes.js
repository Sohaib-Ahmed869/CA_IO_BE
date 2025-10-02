// routes/formSubmissionRoutes.js
const express = require("express");
const router = express.Router();
const formSubmissionController = require("../controllers/formSubmissionController");
const { authenticate } = require("../middleware/auth");
const { validateRTOAccess } = require("../middleware/rtoAccess");
const applicationController = require("../controllers/applicationController");

// All form submission routes require authentication
router.use(authenticate);
// All form submission routes require RTO access validation
router.use(validateRTOAccess);

// Get all forms for a specific application
router.get(
  "/application/:applicationId/forms",
  formSubmissionController.getApplicationForms
);

// Get a specific form template for filling
router.get(
  "/application/:applicationId/form/:formTemplateId",
  formSubmissionController.getFormForFilling
);

// Submit or update a form
router.post(
  "/application/:applicationId/form/:formTemplateId/submit",
  formSubmissionController.submitForm
);

// Get user's form submissions for an application
router.get(
  "/application/:applicationId/submissions",
  formSubmissionController.getUserFormSubmissions
);

// Resubmit a form
router.post(
  "/submission/:submissionId/resubmit",
  formSubmissionController.resubmitForm
);

// Get forms requiring resubmission for an application
router.get(
  "/application/:applicationId/resubmission-required",
  formSubmissionController.getResubmissionRequiredForms
);

// Get form submission details
router.get(
  "/submission/:id",
  formSubmissionController.getSubmissionById
);

router.put("/:applicationId/step", formSubmissionController.updateApplicationStep);


module.exports = router;
