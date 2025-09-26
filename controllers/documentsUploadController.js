// controllers/documentUploadController.js
const DocumentUpload = require("../models/documentUpload");
const Application = require("../models/application");
const { logMe } = require("../utils/logger");
const emailService = require("../services/emailService2");
const User = require("../models/user");
const {
  generatePresignedUrl,
  generateCloudFrontUrl,
  deleteFileFromS3,
} = require("../config/s3Config");

const documentUploadController = {
  // In documentUploadController.js - Replace the uploadDocuments function with this:

  // In documentUploadController.js - Replace the uploadDocuments function with this:

  // REPLACE THE ENTIRE uploadDocuments function with this:

  uploadDocuments: async (req, res) => {
    try {
      const { applicationId } = req.params;
      const userId = req.user.id;
      const files = req.files;

      logMe("documents.upload_start", { files: files?.length || 0 });

      if (!files || files.length === 0) {
        return res.status(400).json({
          success: false,
          message: "No files uploaded",
        });
      }

      // Verify application
      const application = await Application.findOne({
        _id: applicationId,
        userId: userId,
      });

      if (!application) {
        return res.status(404).json({
          success: false,
          message: "Application not found",
        });
      }

      // Get or create document upload record
      let documentUpload = await DocumentUpload.findOne({
        applicationId,
        userId,
      });

      if (!documentUpload) {
        documentUpload = new DocumentUpload({
          applicationId,
          userId,
          documents: [],
        });
      }

      logMe("documents.before_document_count", { count: documentUpload.documents.length }, "debug");

      // Create EXACTLY the number of documents as files received
      const documentsToAdd = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        logMe("documents.processing_file", { index: i + 1, name: file.originalname }, "debug");

        documentsToAdd.push({
          documentType: req.body.documentType || "general",
          category: req.body.category || "supporting",
          fileName: file.key.split("/").pop(),
          originalName: file.originalname,
          s3Key: file.key,
          s3Bucket: file.bucket,
          cloudFrontUrl: null,
          fileSize: file.size,
          mimeType: file.mimetype,
          fileExtension: file.originalname.split(".").pop().toLowerCase(),
          notes: req.body.notes || "",
        });
      }

      logMe("documents.to_add_count", { count: documentsToAdd.length }, "debug");

      // Add documents ONE TIME ONLY
      for (const doc of documentsToAdd) {
        documentUpload.documents.push(doc);
      }

      documentUpload.status = "uploaded";

     
      // Save
      await documentUpload.save();


      // Update application
      if (!application.documentUploadId) {
        await Application.findByIdAndUpdate(applicationId, {
          documentUploadId: documentUpload._id,
        });
      }

      // Update application progress with new step calculator
      try {
        const { updateApplicationStep } = require("../utils/stepCalculator");
        await updateApplicationStep(applicationId);
      } catch (error) {
        logMe("application.progress_update_error", error, "error");
      }

      // Return response - get ONLY the last N documents where N = files.length
      const recentDocs = documentUpload.documents.slice(-files.length);

      const uploadedDocsWithIds = recentDocs.map((doc) => ({
        id: doc._id.toString(),
        fileName: doc.fileName,
        originalName: doc.originalName,
        s3Key: doc.s3Key,
        fileSize: doc.fileSize,
        mimeType: doc.mimeType,
        documentType: doc.documentType,
        category: doc.category,
      }));


      res.json({
        success: true,
        message: `${files.length} document(s) uploaded successfully`,
        data: {
          documentUpload: documentUpload,
          uploadedFiles: uploadedDocsWithIds,
        },
      });
    } catch (error) {
      logMe("documents.upload_error", error, "error");
      res.status(500).json({
        success: false,
        message: "Error uploading documents",
        error: error.message,
      });
    }
  },

  // Get documents for an application
  getDocuments: async (req, res) => {
    try {
      const { applicationId } = req.params;
      const userId = req.user.id;

      // Verify application access
      const application = await Application.findOne({
        _id: applicationId,
      }).populate("certificationId");

      if (!application) {
        return res.status(404).json({
          success: false,
          message: "Application not found",
        });
      }

      const documentUpload = await DocumentUpload.findOne({
        applicationId,
      });

      if (!documentUpload) {
        return res.json({
          success: true,
          data: {
            documents: [],
            status: "pending",
            imageCount: 0,
            videoCount: 0,
            canAddImages: true,
            canAddVideos: true,
            competencyUnits: application?.certificationId || [],
          },
        });
      }

      // Generate presigned URLs for documents - FIXED to handle async properly
      // With this enhanced version:
      const documentsWithUrls = await Promise.all(
        documentUpload.documents.map(async (doc) => {
          try {
            const directUrl = await generatePresignedUrl(doc.s3Key, 3600);
            return {
              ...doc.toObject(),
              presignedUrl: directUrl,
            };
          } catch (error) {
            logMe("documents.presign_error", { s3Key: doc.s3Key, message: error?.message }, "warn");
            return {
              ...doc.toObject(),
              presignedUrl: null,
            };
          }
        })
      );

      res.json({
        success: true,
        data: {
          documents: documentsWithUrls,
          status: documentUpload.status,
          // Separate counters for different document types
          imageCount: documentUpload.documents.filter(doc =>
            doc.documentType === "photo_evidence" &&
            doc.mimeType && doc.mimeType.startsWith("image/")
          ).length,
          videoCount: documentUpload.documents.filter(doc =>
            doc.documentType === "video_demonstration" &&
            doc.mimeType && doc.mimeType.startsWith("video/")
          ).length,
          // Regular document counters (for document upload screen)
          regularImageCount: documentUpload.documents.filter(doc =>
            doc.documentType !== "photo_evidence" &&
            doc.documentType !== "video_demonstration" &&
            doc.mimeType && doc.mimeType.startsWith("image/")
          ).length,
          regularVideoCount: documentUpload.documents.filter(doc =>
            doc.documentType !== "photo_evidence" &&
            doc.documentType !== "video_demonstration" &&
            doc.mimeType && doc.mimeType.startsWith("video/")
          ).length,
          canAddImages: documentUpload.documents.filter(doc =>
            doc.documentType === "photo_evidence"
          ).length < 30,
          canAddVideos: documentUpload.documents.filter(doc =>
            doc.documentType === "video_demonstration"
          ).length < 12,
          competencyUnits: application?.certificationId || [],
          submittedAt: documentUpload.submittedAt,
          verifiedAt: documentUpload.verifiedAt,
        },
      });
    } catch (error) {
      logMe("documents.get_error", error, "error");
      res.status(500).json({
        success: false,
        message: "Error fetching documents",
      });
    }
  },

  // Add this new function after the existing getDocuments function:

  // Admin: Get documents with fresh presigned URLs
  getDocumentsForAdmin: async (req, res) => {
    try {
      const { applicationId } = req.params;

      // Verify application exists (admin can access any application)
      const application = await Application.findOne({
        _id: applicationId,
      });

      if (!application) {
        return res.status(404).json({
          success: false,
          message: "Application not found",
        });
      }

      const documentUpload = await DocumentUpload.findOne({
        applicationId,
      });

      if (!documentUpload) {
        return res.json({
          success: true,
          data: {
            documents: [],
            status: "pending",
            imageCount: 0,
            videoCount: 0,
            canAddImages: true,
            canAddVideos: true,
          },
        });
      }

      // Generate fresh presigned URLs for all documents
      // Generate direct URLs for all documents
      const documentsWithUrls = documentUpload.documents.map((doc) => {
        const bucketName = process.env.S3_BUCKET_NAME || "certifiediobucket";
        const directUrl = `https://${bucketName}.s3.amazonaws.com/${doc.s3Key}`;

        return {
          ...doc.toObject(),
          presignedUrl: directUrl,
        };
      });

      res.json({
        success: true,
        data: {
          documents: documentsWithUrls,
          status: documentUpload.status,
          imageCount: documentUpload.getImageCount(),
          videoCount: documentUpload.getVideoCount(),
          canAddImages: documentUpload.canAddImages(1),
          canAddVideos: documentUpload.canAddVideos(1),
          submittedAt: documentUpload.submittedAt,
          verifiedAt: documentUpload.verifiedAt,
        },
      });
    } catch (error) {
      logMe("documents.admin_get_error", error, "error");
      res.status(500).json({
        success: false,
        message: "Error fetching documents",
      });
    }
  },

  // Delete a document
  deleteDocument: async (req, res) => {
    try {
      const { applicationId, documentId } = req.params;
      const userId = req.user.id;

      const documentUpload = await DocumentUpload.findOne({
        applicationId,
        userId,
      });

      logMe("documents.record_found", { id: documentUpload?._id }, "debug");

      if (!documentUpload) {
        return res.status(404).json({
          success: false,
          message: "Document upload record not found",
        });
      }

      logMe("documents.delete_request", { documentId }, "debug");

      const documentIndex = documentUpload.documents.findIndex(
        (doc) => doc._id.toString() === documentId
      );

      if (documentIndex === -1) {
        logMe("documents.record_not_found", {}, "warn");
        return res.status(404).json({
          success: false,
          message: "Document not found",
        });
      }

      const document = documentUpload.documents[documentIndex];

      // Delete from S3
      const deleteResult = await deleteFileFromS3(document.s3Key);
      if (!deleteResult.success) {
        return res.status(500).json({
          success: false,
          message: "Error deleting file from storage",
        });
      }

      // Remove from database
      documentUpload.documents.splice(documentIndex, 1);
      await documentUpload.save();

      res.json({
        success: true,
        message: "Document deleted successfully",
        data: {
          imageCount: documentUpload.getImageCount(),
          videoCount: documentUpload.getVideoCount(),
        },
      });
    } catch (error) {
      logMe("documents.delete_error", error, "error");
      res.status(500).json({
        success: false,
        message: "Error deleting document",
      });
    }
  },

  // Submit documents for review with optional scope control
  // Optional parameters in request body:
  // - resubmissionType: "documents" | "evidence" | "both" (recommended)
  // - submitScope: "documents" | "evidence" | "both" (legacy)
  // - query.type: "documents" | "evidence" | "both" (URL parameter)
  submitDocuments: async (req, res) => {
    try {
      const { applicationId } = req.params;
      const userId = req.user.id;

      const documentUpload = await DocumentUpload.findOne({
        applicationId,
        userId,
      });

      if (!documentUpload || documentUpload.documents.length === 0) {
        return res.status(400).json({
          success: false,
          message: "No documents uploaded",
        });
      }

      // Determine submission scope
      // Auto-detect based on new uploads since last submittedAt; if ambiguous, fall back to rejected items
      // Supports multiple optional parameters for explicit scope control (in order of priority):
      // 1. submitScope (legacy parameter)
      // 2. resubmissionType (new explicit parameter)
      // 3. query.type (URL parameter)
      const hintedScope = (req.body.submitScope || req.body.resubmissionType || req.query.type || '').toLowerCase();
      
      // Validate the hinted scope if provided
      if (hintedScope && !['documents', 'evidence', 'both'].includes(hintedScope)) {
        logMe("documents.invalid_resubmission_scope", { hintedScope }, "warn");
      }

      const isEvidenceDoc = (doc) =>
        doc.documentType === "photo_evidence" || doc.documentType === "video_demonstration";
      const isRegularDoc = (doc) => !isEvidenceDoc(doc);

      // Check what type of documents exist in the record (used for step movement defaults)
      const hasRegularDocs = documentUpload.documents.some(isRegularDoc);
      const hasEvidence = documentUpload.documents.some(isEvidenceDoc);

      // Detect recent uploads per category since last submittedAt to scope resubmission precisely
      const lastSubmittedAt = documentUpload.submittedAt || new Date(0);
      const hasNewEvidenceSinceSubmit = documentUpload.documents.some(d =>
        isEvidenceDoc(d) && d.uploadedAt && new Date(d.uploadedAt) > new Date(lastSubmittedAt)
      );
      const hasNewRegularSinceSubmit = documentUpload.documents.some(d =>
        isRegularDoc(d) && d.uploadedAt && new Date(d.uploadedAt) > new Date(lastSubmittedAt)
      );



      const rejectedEvidenceDocs = documentUpload.documents.filter((d) => isEvidenceDoc(d) && (d.verificationStatus === 'rejected' || d.verificationStatus === 'requires_update'));
      const rejectedRegularDocs = documentUpload.documents.filter((d) => isRegularDoc(d) && (d.verificationStatus === 'rejected' || d.verificationStatus === 'requires_update'));
      const hasRejectedEvidence = rejectedEvidenceDocs.length > 0;
      const hasRejectedRegular = rejectedRegularDocs.length > 0;


      let submitScope;
      if (hintedScope === 'documents' || hintedScope === 'evidence' || hintedScope === 'both') {
        submitScope = hintedScope;
        const source = req.body.submitScope ? 'submitScope' : req.body.resubmissionType ? 'resubmissionType' : 'query.type';
        logMe("documents.scope_hint", { submitScope, source }, "debug");
      } else if (hasNewEvidenceSinceSubmit && !hasNewRegularSinceSubmit) {
        submitScope = 'evidence';
        logMe('documents.scope_auto_evidence', {}, 'debug');
      } else if (hasNewRegularSinceSubmit && !hasNewEvidenceSinceSubmit) {
        submitScope = 'documents';
        logMe('documents.scope_auto_documents', {}, 'debug');
      } else if (hasNewEvidenceSinceSubmit && hasNewRegularSinceSubmit) {
        submitScope = 'both';
        logMe('documents.scope_auto_both', {}, 'debug');
      } else if (hasRejectedRegular && hasRejectedEvidence) {
        // Fall back to rejections when no new uploads detected
        submitScope = 'both';
        logMe('documents.scope_fallback_both', {}, 'debug');
      } else if (hasRejectedRegular) {
        submitScope = 'documents';
        logMe('documents.scope_fallback_documents', {}, 'debug');
      } else if (hasRejectedEvidence) {
        submitScope = 'evidence';
        logMe('documents.scope_fallback_evidence', {}, 'debug');
      } else {
        // Default conservatively: if only one category exists, use it; if both exist, require explicit hint
        submitScope = hasEvidence && !hasRegularDocs ? 'evidence' : 'documents';
        logMe('documents.scope_default', { submitScope, hasEvidence, hasRegularDocs }, 'debug');
      }

      // SAFETY CHECK: If scope is 'both' but we only have one type of document, adjust it
      if (submitScope === 'both' && hasEvidence && !hasRegularDocs) {
        submitScope = 'evidence';
        logMe('documents.scope_safety_adjustment', { from: 'both', to: 'evidence' }, 'debug');
      } else if (submitScope === 'both' && hasRegularDocs && !hasEvidence) {
        submitScope = 'documents';
        logMe('documents.scope_safety_adjustment', { from: 'both', to: 'documents' }, 'debug');
      }

      logMe('documents.submit_debug', {
        applicationId: applicationId.toString(),
        submitScope,
        docCount: (documentUpload?.documents || []).length,
      }, 'debug');

      // Clear rejection reasons and verification history ONLY for targeted scope
      let resetCount = 0;
      const resetDetails = [];
      documentUpload.documents.forEach(doc => {
        const isEvidence = isEvidenceDoc(doc);
        const isRegular = isRegularDoc(doc);
        
        const shouldReset =
          submitScope === 'both' ||
          (submitScope === 'evidence' && isEvidence) ||
          (submitScope === 'documents' && isRegular);

        logMe('documents.submit_detail', { id: doc._id, type: doc.documentType, isEvidence, isRegular, shouldReset, submitScope }, 'debug');

        if (shouldReset) {
          doc.rejectionReason = null;
          doc.verificationStatus = "pending";
          doc.isVerified = false;
          doc.verifiedBy = null;
          doc.verifiedAt = null;
          resetCount++;
          resetDetails.push({
            id: doc._id,
            type: doc.documentType,
            isEvidence: isEvidence,
            isRegular: isRegular
          });
        }
      });

      logMe('documents.reset_debug', {
        applicationId: applicationId.toString(),
        submitScope,
      }, 'debug');

      // Clear overall rejection reason and verification history CONSERVATIVELY
      // Do NOT clear overall comments when only one tab is being resubmitted.
      // Only clear when resubmitting both categories together.
      if (submitScope === 'both') {
        documentUpload.rejectionReason = null;
        documentUpload.verifiedBy = null;
        documentUpload.verifiedAt = null;
      }

      documentUpload.status = "under_review";
      documentUpload.submittedAt = new Date();
      await documentUpload.save();

      // Get the application to check current step
      const application = await Application.findById(applicationId)
        .populate("userId", "firstName lastName email")
        .populate("certificationId", "name");

      // Update application status and step based on targeted scope
      let newStatus = "under_review";
      let newStep = application.currentStep || 3;

      const submittingDocs = submitScope === 'documents' || (submitScope === 'both' && hasRegularDocs);
      const submittingEvidence = submitScope === 'evidence' || (submitScope === 'both' && hasEvidence);

      if (submittingDocs) {
        newStep = Math.max(4, newStep);
      }
      if (submittingEvidence) {
        newStep = Math.max(5, newStep);
      }

      await Application.findByIdAndUpdate(applicationId, {
        overallStatus: newStatus,
        currentStep: newStep,
      });

      // SEND EMAIL NOTIFICATION TO STUDENT - scope-aware
      try {
        const documentType = submittingEvidence && !submittingDocs
          ? "Evidence"
          : submittingDocs && !submittingEvidence
            ? "Supporting Documents"
            : "Documents"; // both or fallback
        await emailService.sendDocumentSubmissionEmail(
          application.userId,
          application,
          documentType
        );
        logMe(
          `📧 Document submission email sent to ${application.userId.email}`
        );
      } catch (emailError) {
        logMe("email.document_submission_error", emailError, "error");
        // Don't fail the main operation if email fails
      }

      // Notify assigned assessor that documents/evidence have been (re)submitted
      try {
        const appWithAssessor = await Application.findById(applicationId)
          .populate("assignedAssessor", "firstName lastName email")
          .populate("userId", "firstName lastName email")
          .populate("certificationId", "name");

        if (appWithAssessor && appWithAssessor.assignedAssessor) {
          await emailService.sendAssessorDocumentResubmissionNotice(
            appWithAssessor.assignedAssessor,
            appWithAssessor.userId,
            appWithAssessor
          );
          logMe('documents.email_assessor_resubmission', { email: appWithAssessor.assignedAssessor?.email }, 'debug');
        }
      } catch (assessorEmailErr) {
        logMe("email.assessor_resubmission_error", assessorEmailErr, "error");
      }

      res.json({
        success: true,
        message: hasEvidence
          ? "Evidence submitted for review"
          : "Documents submitted for review",
        data: documentUpload,
      });
    } catch (error) {
      logMe("documents.submit_error", error, "error");
      res.status(500).json({
        success: false,
        message: "Error submitting documents",
      });
    }
  },

  // UPDATE THE verifyDocuments METHOD (around line 520)
  // Admin/Assessor: Verify documents
  verifyDocuments: async (req, res) => {
    try {
      const { applicationId } = req.params;
      const { status, rejectionReason, documentVerifications } = req.body;
      const assessorId = req.user.id;

      const documentUpload = await DocumentUpload.findOne({ applicationId });

      if (!documentUpload) {
        return res.status(404).json({
          success: false,
          message: "Document upload record not found",
        });
      }

      // Get application and user details for email
      const application = await Application.findById(applicationId)
        .populate("userId", "firstName lastName email")
        .populate("certificationId", "name");

      const assessor = await User.findById(assessorId, "firstName lastName");

      // Update individual document verifications
      if (documentVerifications && Array.isArray(documentVerifications)) {
        documentVerifications.forEach((verification) => {
          const document = documentUpload.documents.find(
            (doc) => doc._id.toString() === verification.documentId
          );
          if (document) {
            document.verificationStatus = verification.status;
            document.isVerified = verification.status === "verified";
            document.verifiedBy = assessorId;
            document.verifiedAt = new Date();
            if (verification.rejectionReason) {
              document.rejectionReason = verification.rejectionReason;
            }
          }
        });
      }

      // Update overall status
      documentUpload.status = status;
      documentUpload.verifiedBy = assessorId;
      documentUpload.verifiedAt = new Date();
      if (rejectionReason) {
        documentUpload.rejectionReason = rejectionReason;
      }

      await documentUpload.save();

      // Update application status based on document verification
      let applicationStatus = "under_review";
      if (status === "verified") {
        applicationStatus = "assessment_completed";
      } else if (status === "rejected" || status === "requires_update") {
        applicationStatus = "in_progress"; // Back to in progress for resubmission
      }

      await Application.findByIdAndUpdate(applicationId, {
        overallStatus: applicationStatus,
      });

      // SEND EMAIL NOTIFICATIONS - ADD THIS BLOCK
      try {
        if (status === "verified") {
          // Send verification success email
          await emailService.sendDocumentVerificationEmail(
            application.userId,
            application,
            assessor,
            "verified"
          );
          logMe('documents.email_student_verification', { email: application.userId?.email }, 'debug');
        } else if (status === "rejected" || status === "requires_update") {
          // Send rejection/resubmission required email
          await emailService.sendDocumentVerificationEmail(
            application.userId,
            application,
            assessor,
            "rejected",
            rejectionReason
          );
        }
        logMe(
          `📧 Document verification email sent to ${application.userId.email}`
        );
      } catch (emailError) {
        logMe("email.document_verification_error", emailError, "error");
        // Don't fail the main operation if email fails
      }

      res.json({
        success: true,
        message: "Documents verified successfully",
        data: documentUpload,
      });
    } catch (error) {
      logMe("documents.verify_error", error, "error");
      res.status(500).json({
        success: false,
        message: "Error verifying documents",
      });
    }
  },

  // Get document by ID with URL (for viewing)
  getDocumentById: async (req, res) => {
    try {
      const { applicationId, documentId } = req.params;
      const userId = req.user.id;

      const documentUpload = await DocumentUpload.findOne({
        applicationId,
        userId,
      });

      if (!documentUpload) {
        return res.status(404).json({
          success: false,
          message: "Document upload record not found",
        });
      }

      const document = documentUpload.documents.find(
        (doc) => doc._id.toString() === documentId
      );

      if (!document) {
        return res.status(404).json({
          success: false,
          message: "Document not found",
        });
      }

      // FIXED to handle async properly
      const documentWithUrl = {
        ...document.toObject(),
        presignedUrl: await generatePresignedUrl(document.s3Key, 3600),
      };

      res.json({
        success: true,
        data: documentWithUrl,
      });
    } catch (error) {
      logMe("documents.get_by_id_error", error, "error");
      res.status(500).json({
        success: false,
        message: "Error fetching document",
      });
    }
  },

  // Update document details
  updateDocument: async (req, res) => {
    try {
      const { applicationId, documentId } = req.params;
      const { documentType, category, notes } = req.body;
      const userId = req.user.id;

      const documentUpload = await DocumentUpload.findOne({
        applicationId,
        userId,
      });

      if (!documentUpload) {
        return res.status(404).json({
          success: false,
          message: "Document upload record not found",
        });
      }

      const document = documentUpload.documents.find(
        (doc) => doc._id.toString() === documentId
      );

      if (!document) {
        return res.status(404).json({
          success: false,
          message: "Document not found",
        });
      }

      // Update document details
      if (documentType) document.documentType = documentType;
      if (category) document.category = category;
      if (notes !== undefined) document.notes = notes;

      await documentUpload.save();

      res.json({
        success: true,
        message: "Document updated successfully",
        data: document,
      });
    } catch (error) {
      logMe("documents.update_error", error, "error");
      res.status(500).json({
        success: false,
        message: "Error updating document",
      });
    }
  },
};

module.exports = documentUploadController;
