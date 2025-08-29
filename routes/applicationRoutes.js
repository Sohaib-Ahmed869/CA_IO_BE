const express = require("express");
const router = express.Router();
const applicationController = require("../controllers/applicationController");
const { authenticate } = require("../middleware/auth");

// All routes require authentication
router.use(authenticate);


router.get('/:applicationId/certificate', applicationController.getApplicationWithCertificate);

// Get user's applications
router.get("/user", applicationController.getUserApplications);
// Get user's applications with steps (optional ?actor=student|assessor|admin|third_party)
router.get("/user/with-steps", applicationController.getUserApplicationsWithSteps);

// Create new application
router.post("/create", applicationController.createNewApplication);


// Create application with initial screening
router.post(
  "/create-with-screening",
  applicationController.createApplicationWithScreening
);

// Get available certifications for new applications
router.get(
  "/available-certifications",
  applicationController.getAvailableCertifications
);

// Get specific application
router.get("/:applicationId", applicationController.getApplicationById);


// Application progress routes
router.get("/:applicationId/progress", applicationController.getApplicationProgress);
router.put("/:applicationId/progress", applicationController.updateApplicationProgress);

// Dynamic steps route
router.get("/:applicationId/steps", applicationController.getApplicationSteps);

// Update specific step status
router.put("/:applicationId/steps/:stepType", applicationController.updateStepStatus);

module.exports = router;
