const express = require("express");
const router = express.Router();
const applicationController = require("../controllers/applicationController");
const { authenticate } = require("../middleware/auth");

// All routes require authentication
router.use(authenticate);


router.get('/:applicationId/certificate', applicationController.getApplicationWithCertificate);

// Get user's applications
router.get("/user", applicationController.getUserApplications);

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


module.exports = router;
