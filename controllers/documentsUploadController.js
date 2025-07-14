// controllers/documentUploadController.js
const DocumentUpload = require("../models/documentUpload");
const Application = require("../models/application");
const {
  generatePresignedUrl,
  generateCloudFrontUrl,
  deleteFileFromS3,
} = require("../config/s3Config");

const documentUploadController = {
  // Upload documents
  uploadDocuments: async (req, res) => {
    try {
      const { applicationId } = req.params;
      const userId = req.user.id;
      const files = req.files;

      if (!files || files.length === 0) {
        return res.status(400).json({
          success: false,
          message: "No files uploaded",
        });
      }

      // Verify application belongs to user
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

      // Count current files
      const currentImages = documentUpload.getImageCount();
      const currentVideos = documentUpload.getVideoCount();

      const newImages = files.filter((f) =>
        f.mimetype.startsWith("image/")
      ).length;
      const newVideos = files.filter((f) =>
        f.mimetype.startsWith("video/")
      ).length;

      // Check limits
      if (!documentUpload.canAddImages(newImages)) {
        return res.status(400).json({
          success: false,
          message: `Cannot upload ${newImages} images. Maximum 20 images allowed. Current: ${currentImages}`,
        });
      }

      if (!documentUpload.canAddVideos(newVideos)) {
        return res.status(400).json({
          success: false,
          message: `Cannot upload ${newVideos} videos. Maximum 5 videos allowed. Current: ${currentVideos}`,
        });
      }

      // Process uploaded files
      const newDocuments = files.map((file) => ({
        documentType: req.body.documentType || "general",
        category: req.body.category || "supporting",
        fileName: file.key.split("/").pop(),
        originalName: file.originalname,
        s3Key: file.key,
        s3Bucket: file.bucket,
        // cloudFrontUrl: generateCloudFrontUrl(file.key), // Optional - not needed
        cloudFrontUrl: null, // Keep it simple
        fileSize: file.size,
        mimeType: file.mimetype,
        fileExtension: file.originalname.split(".").pop().toLowerCase(),
        notes: req.body.notes || "",
      }));

      // Add documents to upload record
      documentUpload.documents.push(...newDocuments);
      documentUpload.status = "uploaded";
      await documentUpload.save();

      // Update application with document upload ID
      if (!application.documentUploadId) {
        await Application.findByIdAndUpdate(applicationId, {
          documentUploadId: documentUpload._id,
        });
      }

      res.json({
        success: true,
        message: `${files.length} document(s) uploaded successfully`,
        data: {
          documentUpload: documentUpload,
          uploadedFiles: newDocuments,
        },
      });
    } catch (error) {
      console.error("Upload documents error:", error);
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
            console.error(`Error generating URL for ${doc.s3Key}:`, error);
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
          imageCount: documentUpload.getImageCount(),
          videoCount: documentUpload.getVideoCount(),
          canAddImages: documentUpload.canAddImages(1),
          canAddVideos: documentUpload.canAddVideos(1),
          competencyUnits: application?.certificationId?.competencyUnits || [], // Add this line
          submittedAt: documentUpload.submittedAt,
          verifiedAt: documentUpload.verifiedAt,
        },
      });
    } catch (error) {
      console.error("Get documents error:", error);
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
      console.error("Get documents for admin error:", error);
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

      console.log("Document upload record:", documentUpload);

      if (!documentUpload) {
        return res.status(404).json({
          success: false,
          message: "Document upload record not found",
        });
      }

      console.log("Document ID to delete:", documentId);
      
      const documentIndex = documentUpload.documents.findIndex(
        (doc) => doc._id.toString() === documentId
      );
      
      if (documentIndex === -1) {
        console.log("Document upload record not found");
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
      console.error("Delete document error:", error);
      res.status(500).json({
        success: false,
        message: "Error deleting document",
      });
    }
  },

  // Submit documents for review
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

      // Check what type of documents are being submitted
      const hasRegularDocs = documentUpload.documents.some(
        (doc) =>
          doc.documentType !== "photo_evidence" &&
          doc.documentType !== "video_demonstration"
      );

      const hasEvidence = documentUpload.documents.some(
        (doc) =>
          doc.documentType === "photo_evidence" ||
          doc.documentType === "video_demonstration"
      );

      documentUpload.status = "under_review";
      documentUpload.submittedAt = new Date();
      await documentUpload.save();

      // Get the application to check current step
      const application = await Application.findById(applicationId)
        .populate("userId", "firstName lastName email")
        .populate("certificationId", "name");

      // Update application status and step based on what was submitted
      let newStatus = "under_review";
      let newStep = application.currentStep || 3;

      // If regular documents were submitted, move to step 4
      if (hasRegularDocs) {
        newStep = Math.max(4, newStep);
      }

      // If evidence was submitted, move to step 5
      if (hasEvidence) {
        newStep = Math.max(5, newStep);
      }

      await Application.findByIdAndUpdate(applicationId, {
        overallStatus: newStatus,
        currentStep: newStep,
      });

      // SEND EMAIL NOTIFICATION TO STUDENT - ADD THIS BLOCK
      try {
        const documentType = hasEvidence ? "Evidence" : "Supporting Documents";
        await emailService.sendDocumentSubmissionEmail(
          application.userId,
          application,
          documentType
        );
        console.log(
          `Document submission email sent to ${application.userId.email}`
        );
      } catch (emailError) {
        console.error("Error sending document submission email:", emailError);
        // Don't fail the main operation if email fails
      }

      res.json({
        success: true,
        message: hasEvidence
          ? "Evidence submitted for review"
          : "Documents submitted for review",
        data: documentUpload,
      });
    } catch (error) {
      console.error("Submit documents error:", error);
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
      } else if (status === "rejected") {
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
        } else if (status === "rejected") {
          // Send rejection/resubmission required email
          await emailService.sendDocumentVerificationEmail(
            application.userId,
            application,
            assessor,
            "rejected",
            rejectionReason
          );
        }
        console.log(
          `Document verification email sent to ${application.userId.email}`
        );
      } catch (emailError) {
        console.error("Error sending document verification email:", emailError);
        // Don't fail the main operation if email fails
      }

      res.json({
        success: true,
        message: "Documents verified successfully",
        data: documentUpload,
      });
    } catch (error) {
      console.error("Verify documents error:", error);
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
      console.error("Get document by ID error:", error);
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
      console.error("Update document error:", error);
      res.status(500).json({
        success: false,
        message: "Error updating document",
      });
    }
  },

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
      } else if (status === "rejected") {
        applicationStatus = "in_progress"; // Back to in progress for resubmission
      }

      await Application.findByIdAndUpdate(applicationId, {
        overallStatus: applicationStatus,
      });

      res.json({
        success: true,
        message: "Documents verified successfully",
        data: documentUpload,
      });
    } catch (error) {
      console.error("Verify documents error:", error);
      res.status(500).json({
        success: false,
        message: "Error verifying documents",
      });
    }
  },
};

module.exports = documentUploadController;
