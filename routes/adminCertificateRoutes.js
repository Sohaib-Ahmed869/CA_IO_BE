// routes/certificateRoutes.js - CREATE THIS NEW FILE

const express = require("express");
const router = express.Router();
const certificateController = require("../controllers/adminCertificateController");
const { upload } = require("../config/s3Config");
const { authenticate, authorize } = require("../middleware/auth");

// All routes require authentication
router.use(authenticate);



// Download user's certificate
router.get(
  "/download/:applicationId",
  certificateController.downloadCertificate
);

// ADMIN ROUTES
// Upload final certificate (admin only)
router.post(
  "/upload/:applicationId",
  authorize("admin", "assessor", "user"),
  upload.single("certificate"),
  certificateController.uploadFinalCertificate
);

// Get all issued certificates (admin only)
router.get(
  "/admin/all",
  authorize("admin", "assessor", "user"),
  certificateController.getAllIssuedCertificates
);

// View certificate (admin only)
router.get(
  "/view/:applicationId",
  authorize("admin", "assessor", "user"),
  certificateController.viewCertificate
);

// Stream certificate inline with Range support
router.get(
  "/stream/:applicationId",
  authorize("admin", "assessor", "user"),
  certificateController.streamCertificate
);

// Generate inline presigned URL with response-content-* overrides
router.get(
  "/inline-url/:applicationId",
  authorize("admin", "assessor", "user"),
  certificateController.inlineUrl
);

module.exports = router;
