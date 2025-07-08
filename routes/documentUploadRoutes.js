// routes/documentUploadRoutes.js
const express = require("express");
const router = express.Router();
const { authenticate, authorize } = require("../middleware/auth");
const { upload } = require("../config/s3Config");
const documentUploadController = require("../controllers/documentsUploadController");

// All routes require authentication
router.use(authenticate);

// Upload documents for an application
router.post(
  "/:applicationId/upload",
  upload.array("documents", 25), // Allow up to 25 files
  documentUploadController.uploadDocuments
);

// Get documents for an application
router.get("/:applicationId", documentUploadController.getDocuments);

// Get specific document by ID
router.get(
  "/:applicationId/document/:documentId",
  documentUploadController.getDocumentById
);

// Update document details
router.put(
  "/:applicationId/document/:documentId",
  documentUploadController.updateDocument
);

// Delete a document
router.delete(
  "/:applicationId/document/:documentId",
  documentUploadController.deleteDocument
);

// Submit documents for review
router.post("/:applicationId/submit", documentUploadController.submitDocuments);

// Admin/Assessor routes
router.put(
  "/:applicationId/verify",
  authorize("admin", "assessor"),
  documentUploadController.verifyDocuments
);

module.exports = router;
