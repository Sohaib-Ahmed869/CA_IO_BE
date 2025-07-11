// routes/assessorFormRoutes.js
const express = require("express");
const router = express.Router();
const { authenticate, authorize } = require("../middleware/auth");

const {
  getAssessorForms,
  getAssessorFormForFilling,
  submitAssessorForm,
  getMappingForms,
  getAssessorSubmissions,
} = require("../controllers/assessorFormController");

// All routes require authentication and assessor role
router.use(authenticate);
router.use(authorize("assessor", "admin"));

// Get all assessor forms for a specific application
router.get("/application/:applicationId/forms", getAssessorForms);

// Get specific assessor form for filling
router.get(
  "/application/:applicationId/form/:formTemplateId",
  getAssessorFormForFilling
);

// Submit assessor form
router.post(
  "/application/:applicationId/form/:formTemplateId/submit",
  submitAssessorForm
);

// Get mapping forms (student examples for reference)
router.get("/mapping/:formTemplateId", getMappingForms);

// Get assessor's own form submissions across all applications
router.get("/submissions", getAssessorSubmissions);

module.exports = router;
