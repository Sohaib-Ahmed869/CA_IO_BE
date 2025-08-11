// routes/signatureRoutes.js
const express = require("express");
const router = express.Router();
const signatureController = require("../controllers/signatureController");
const { authenticate, authorize } = require("../middleware/auth");
const { signatureUpload, handleUploadError } = require("../middleware/upload");

// Public routes (for signature completion)
router.post("/:signatureId/complete", signatureController.completeSignature);

// Protected routes
router.use(authenticate);

// Upload signature file
router.post("/upload", signatureUpload.single("signature"), handleUploadError, signatureController.uploadSignature);

// Get signature by key
router.get("/key/:signatureKey", signatureController.getSignature);

// Delete signature file
router.delete("/key/:signatureKey", signatureController.deleteSignature);

// Create signature request (admin/assessor only)
router.post("/request", authorize("admin", "assessor"), signatureController.createSignatureRequest);

// Get signatures for a form submission
router.get("/submission/:submissionId", signatureController.getSignaturesForSubmission);

// Get signatures for a form (admin/assessor only)
router.get("/form/:formId", authorize("admin", "assessor"), signatureController.getSignaturesForForm);

// Validate a signature
router.get("/:signatureId/validate", signatureController.validateSignature);

// Cancel a signature request (admin/assessor only)
router.put("/:signatureId/cancel", authorize("admin", "assessor"), signatureController.cancelSignature);

// Get signature statistics (admin/assessor only)
router.get("/stats", authorize("admin", "assessor"), signatureController.getSignatureStats);

module.exports = router; 