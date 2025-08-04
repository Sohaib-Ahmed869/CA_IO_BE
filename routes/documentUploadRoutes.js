// routes/documentUploadRoutes.js
const express = require("express");
const router = express.Router();
const { authenticate, authorize } = require("../middleware/auth");
const { upload } = require("../config/s3Config");
const DocumentUpload = require("../models/documentUpload");
const documentUploadController = require("../controllers/documentsUploadController");

// All routes require authentication
router.use(authenticate);

router.get('/:applicationId/resubmission-status', authenticate, async (req, res) => {
  try {
    const { applicationId } = req.params;
    const userId = req.user.id;

    const documentUpload = await DocumentUpload.findOne({
      applicationId,
      userId,
    });

    if (!documentUpload) {
      return res.json({
        success: true,
        data: {
          requiresResubmission: false,
          rejectionReason: null,
        },
      });
    }

    const requiresResubmission = 
      documentUpload.status === 'rejected' || 
      documentUpload.status === 'requires_update';


    
    res.json({
      success: true,
      data: {
        requiresResubmission,
        rejectionReason: documentUpload.rejectionReason,
        status: documentUpload.status,
        verifiedAt: documentUpload.verifiedAt,
      },
    });
  } catch (error) {
    console.error('Error fetching document resubmission status:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching document resubmission status',
    });
  }
});
// Upload documents for an application
router.post(
  "/:applicationId/upload",
  upload.array("documents", 50), // Allow up to 50 files
  documentUploadController.uploadDocuments
);

// Get documents for an application
router.get("/:applicationId", documentUploadController.getDocuments);

router.get(
  "/admin/:applicationId",
  authorize("admin", "assessor", "sales_agent"),
  documentUploadController.getDocumentsForAdmin
);
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
