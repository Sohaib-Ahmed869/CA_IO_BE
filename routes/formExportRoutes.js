const express = require("express");
const router = express.Router();
const formExportController = require("../controllers/formExportController");
const { authenticate } = require("../middleware/auth");

// Download forms for a specific application
router.get(
  "/application/:applicationId/download",
  authenticate,
  formExportController.downloadApplicationForms
);

// Download all forms (Admin only)
router.get(
  "/all/download",
  authenticate,
  formExportController.downloadAllForms
);

// Get export statistics (Admin only)
router.get(
  "/stats",
  authenticate,
  formExportController.getExportStats
);

module.exports = router;
