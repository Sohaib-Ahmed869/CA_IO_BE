// controllers/signatureController.js
const Signature = require("../models/signature");
const FormTemplate = require("../models/formTemplate");
const FormSubmission = require("../models/formSubmission");
const User = require("../models/user");
const logme = require("../utils/logger");
const { rtoFilter } = require("../middleware/tenant");
const { generatePresignedUrl, deleteFileFromS3 } = require("../config/s3Config");

const signatureController = {
  // Upload signature file
  uploadSignature: async (req, res) => {
    try {
      // Get data from both query params and body
      const { 
        submissionId, 
        formId, 
        userType, 
        applicationId, 
        fieldName, 
        fieldLabel 
      } = { ...req.query, ...req.body };
      
      const userId = req.user._id;
      const file = req.file;

      console.log('Upload request data:', {
        submissionId,
        formId,
        userType,
        applicationId,
        fieldName,
        fieldLabel,
        userId,
        hasFile: !!file,
        fileInfo: file ? {
          originalname: file.originalname,
          size: file.size,
          mimetype: file.mimetype,
          key: file.key,
          location: file.location
        } : null
      });

      if (!file) {
        return res.status(400).json({
          success: false,
          message: "No signature file uploaded",
        });
      }

      // Validate file type (only images allowed for signatures)
      if (!file.mimetype.startsWith('image/')) {
        return res.status(400).json({
          success: false,
          message: "Only image files are allowed for signatures",
        });
      }

      // Validate file size (max 5MB for signatures)
      const maxSize = 5 * 1024 * 1024; // 5MB
      if (file.size > maxSize) {
        return res.status(400).json({
          success: false,
          message: "Signature file size must be less than 5MB",
        });
      }

      // Create signature record using the file data from multer-s3
      const signature = new Signature({
        userId,
        userType: userType || req.user.userType,
        fieldName: fieldName || 'uploaded_signature',
        fieldLabel: fieldLabel || (fieldName ? fieldName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) : 'Uploaded Signature'),
        signatureData: file.location, // S3 URL from multer-s3
        signatureType: 'upload',
        status: 'completed',
        signedAt: new Date(),
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year expiry
        ipAddress: req.ip,
        userAgent: req.get("User-Agent"),
        rtoId: req.rtoId,
        // Add form and submission info if provided
        formId: formId || null,
        submissionId: submissionId || null,
        metadata: {
          originalName: file.originalname,
          fileSize: file.size,
          mimeType: file.mimetype,
          s3Key: file.key, // S3 key from multer-s3
          s3Bucket: file.bucket, // S3 bucket from multer-s3
          uploadedAt: new Date(),
          applicationId: applicationId || null,
          submissionId: submissionId || null,
          formId: formId || null
        }
      });

      await signature.save();

      // Populate signature with user info
      const populatedSignature = await Signature.findById(signature._id)
        .populate("userId", "firstName lastName email");

      logme.info("Signature uploaded successfully", {
        signatureId: signature._id,
        userId,
        fieldName,
        fileSize: file.size,
        s3Key: file.key,
        submissionId,
        formId
      });

      res.status(201).json({
        success: true,
        message: "Signature uploaded successfully",
        data: {
          url: file.location, // S3 URL
          key: file.key, // S3 key
          filename: file.originalname,
          size: file.size,
          type: file.mimetype,
          uploadedAt: new Date().toISOString(),
          signatureId: signature._id,
          submissionId: submissionId || null,
          formId: formId || null,
          fieldName: fieldName || null,
          fieldLabel: fieldLabel || null
        }
      });
    } catch (error) {
      logme.error("Upload signature error:", error);
      res.status(500).json({
        success: false,
        message: "Error uploading signature",
        error: error.message,
      });
    }
  },

  // Delete signature file
  deleteSignature: async (req, res) => {
    try {
      const { signatureKey } = req.params;
      const userId = req.user._id;

      // Find signature by key
      const signature = await Signature.findOne({
        'metadata.s3Key': signatureKey,
        userId,
        ...rtoFilter(req.rtoId)
      });

      if (!signature) {
        return res.status(404).json({
          success: false,
          message: "Signature not found",
        });
      }

      // Delete from S3
      try {
        await deleteFileFromS3(signatureKey);
        logme.info("Signature file deleted from S3", { signatureKey });
      } catch (s3Error) {
        logme.warn("Failed to delete signature from S3, continuing with database cleanup", { signatureKey, error: s3Error.message });
      }

      // Delete from database
      await Signature.findByIdAndDelete(signature._id);

      logme.info("Signature deleted successfully", {
        signatureId: signature._id,
        signatureKey,
        userId
      });

      res.json({
        success: true,
        message: "Signature deleted successfully",
      });
    } catch (error) {
      logme.error("Delete signature error:", error);
      res.status(500).json({
        success: false,
        message: "Error deleting signature",
        error: error.message,
      });
    }
  },

  // Get signature by key
  getSignature: async (req, res) => {
    try {
      const { signatureKey } = req.params;

      // Find signature by key
      const signature = await Signature.findOne({
        'metadata.s3Key': signatureKey,
        ...rtoFilter(req.rtoId)
      }).populate("userId", "firstName lastName email");

      if (!signature) {
        return res.status(404).json({
          success: false,
          message: "Signature not found",
        });
      }

      // Generate presigned URL if needed
      let signatureUrl = signature.signatureData;
      if (signature.metadata?.s3Key && !signatureUrl.startsWith('http')) {
        try {
          signatureUrl = await generatePresignedUrl(signature.metadata.s3Key);
        } catch (s3Error) {
          logme.warn("Failed to generate presigned URL, using stored URL", { signatureKey, error: s3Error.message });
        }
      }

      res.json({
        success: true,
        data: {
          signatureId: signature._id,
          url: signatureUrl,
          key: signature.metadata?.s3Key,
          filename: signature.metadata?.originalName,
          size: signature.metadata?.fileSize,
          type: signature.metadata?.mimeType,
          uploadedAt: signature.metadata?.uploadedAt,
          status: signature.status,
          signedAt: signature.signedAt,
          user: signature.userId
        }
      });
    } catch (error) {
      logme.error("Get signature error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching signature",
        error: error.message,
      });
    }
  },

  // Create a new signature request
  createSignatureRequest: async (req, res) => {
    try {
      const { formId, submissionId, fieldName, fieldLabel, userType, expiresIn } = req.body;
      const userId = req.user._id;

      // Validate form exists
      const form = await FormTemplate.findOne({
        _id: formId,
        ...rtoFilter(req.rtoId)
      });

      if (!form) {
        return res.status(404).json({
          success: false,
          message: "Form not found",
        });
      }

      // Validate submission exists
      const submission = await FormSubmission.findOne({
        _id: submissionId,
        formId: formId,
        ...rtoFilter(req.rtoId)
      });

      if (!submission) {
        return res.status(404).json({
          success: false,
          message: "Form submission not found",
        });
      }

      // Check if signature already exists for this field
      const existingSignature = await Signature.findOne({
        formId,
        submissionId,
        fieldName,
        status: { $in: ["pending", "completed"] }
      });

      if (existingSignature) {
        return res.status(400).json({
          success: false,
          message: "Signature request already exists for this field",
        });
      }

      // Calculate expiration date
      const expirationDays = expiresIn || 7;
      const expiresAt = new Date(Date.now() + expirationDays * 24 * 60 * 60 * 1000);

      // Create signature request
      const signature = new Signature({
        formId,
        submissionId,
        userId,
        userType: userType || req.user.userType,
        fieldName,
        fieldLabel,
        status: "pending",
        expiresAt,
        ipAddress: req.ip,
        userAgent: req.get("User-Agent"),
        rtoId: req.rtoId,
      });

      await signature.save();

      // Populate signature with user info
      const populatedSignature = await Signature.findById(signature._id)
        .populate("userId", "firstName lastName email");

      logme.info("Signature request created", {
        signatureId: signature._id,
        formId,
        submissionId,
        fieldName,
        userId,
      });

      res.status(201).json({
        success: true,
        message: "Signature request created successfully",
        data: populatedSignature,
      });
    } catch (error) {
      logme.error("Create signature request error:", error);
      res.status(500).json({
        success: false,
        message: "Error creating signature request",
        error: error.message,
      });
    }
  },

  // Complete a signature
  completeSignature: async (req, res) => {
    try {
      const { signatureId } = req.params;
      const { signatureData, signatureType = "draw" } = req.body;
      const userId = req.user._id;

      // Validate signature exists
      const signature = await Signature.findOne({
        _id: signatureId,
        ...rtoFilter(req.rtoId)
      });

      if (!signature) {
        return res.status(404).json({
          success: false,
          message: "Signature not found",
        });
      }

      // Check if signature is already completed
      if (signature.status === "completed") {
        return res.status(400).json({
          success: false,
          message: "Signature already completed",
        });
      }

      // Check if signature is expired
      if (signature.isExpired()) {
        return res.status(400).json({
          success: false,
          message: "Signature request has expired",
        });
      }

      // Validate signature data
      if (!signatureData) {
        return res.status(400).json({
          success: false,
          message: "Signature data is required",
        });
      }

      // Update signature
      signature.signatureData = signatureData;
      signature.signatureType = signatureType;
      signature.status = "completed";
      signature.signedAt = new Date();
      signature.ipAddress = req.ip;
      signature.userAgent = req.get("User-Agent");

      await signature.save();

      // Populate signature with user info
      const populatedSignature = await Signature.findById(signature._id)
        .populate("userId", "firstName lastName email");

      logme.info("Signature completed", {
        signatureId: signature._id,
        formId: signature.formId,
        submissionId: signature.submissionId,
        fieldName: signature.fieldName,
        userId,
      });

      res.json({
        success: true,
        message: "Signature completed successfully",
        data: populatedSignature,
      });
    } catch (error) {
      logme.error("Complete signature error:", error);
      res.status(500).json({
        success: false,
        message: "Error completing signature",
        error: error.message,
      });
    }
  },

  // Get signatures for a form submission
  getSignaturesForSubmission: async (req, res) => {
    try {
      const { submissionId } = req.params;

      // Validate submission exists
      const submission = await FormSubmission.findOne({
        _id: submissionId,
        ...rtoFilter(req.rtoId)
      });

      if (!submission) {
        return res.status(404).json({
          success: false,
          message: "Form submission not found",
        });
      }

      // Get all signatures for this submission
      const signatures = await Signature.find({
        submissionId,
        ...rtoFilter(req.rtoId)
      })
        .populate("userId", "firstName lastName email")
        .sort({ createdAt: 1 });

      res.json({
        success: true,
        data: signatures,
      });
    } catch (error) {
      logme.error("Get signatures error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching signatures",
        error: error.message,
      });
    }
  },

  // Get signatures for a form
  getSignaturesForForm: async (req, res) => {
    try {
      const { formId } = req.params;
      const { page = 1, limit = 10, status } = req.query;

      // Validate form exists
      const form = await FormTemplate.findOne({
        _id: formId,
        ...rtoFilter(req.rtoId)
      });

      if (!form) {
        return res.status(404).json({
          success: false,
          message: "Form not found",
        });
      }

      // Build filter
      const filter = {
        formId,
        ...rtoFilter(req.rtoId)
      };

      if (status && status !== "all") {
        filter.status = status;
      }

      // Get signatures with pagination
      const signatures = await Signature.find(filter)
        .populate("userId", "firstName lastName email")
        .populate("submissionId", "submittedAt")
        .sort({ createdAt: -1 })
        .limit(limit * 1)
        .skip((page - 1) * limit);

      // Get total count
      const total = await Signature.countDocuments(filter);

      res.json({
        success: true,
        data: {
          signatures,
          pagination: {
            current: parseInt(page),
            pages: Math.ceil(total / limit),
            total,
          },
        },
      });
    } catch (error) {
      logme.error("Get form signatures error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching form signatures",
        error: error.message,
      });
    }
  },

  // Validate a signature
  validateSignature: async (req, res) => {
    try {
      const { signatureId } = req.params;

      const signature = await Signature.findOne({
        _id: signatureId,
        ...rtoFilter(req.rtoId)
      });

      if (!signature) {
        return res.status(404).json({
          success: false,
          message: "Signature not found",
        });
      }

      const validation = signature.validateSignature();

      res.json({
        success: true,
        data: {
          signature,
          validation,
        },
      });
    } catch (error) {
      logme.error("Validate signature error:", error);
      res.status(500).json({
        success: false,
        message: "Error validating signature",
        error: error.message,
      });
    }
  },

  // Cancel a signature request
  cancelSignature: async (req, res) => {
    try {
      const { signatureId } = req.params;
      const userId = req.user._id;

      const signature = await Signature.findOne({
        _id: signatureId,
        ...rtoFilter(req.rtoId)
      });

      if (!signature) {
        return res.status(404).json({
          success: false,
          message: "Signature not found",
        });
      }

      if (signature.status === "completed") {
        return res.status(400).json({
          success: false,
          message: "Cannot cancel completed signature",
        });
      }

      signature.status = "cancelled";
      await signature.save();

      logme.info("Signature cancelled", {
        signatureId: signature._id,
        cancelledBy: userId,
      });

      res.json({
        success: true,
        message: "Signature cancelled successfully",
      });
    } catch (error) {
      logme.error("Cancel signature error:", error);
      res.status(500).json({
        success: false,
        message: "Error cancelling signature",
        error: error.message,
      });
    }
  },

  // Get signature statistics
  getSignatureStats: async (req, res) => {
    try {
      const { period = "30d" } = req.query;
      
      // Calculate date range
      const now = new Date();
      let startDate;
      
      switch (period) {
        case "7d":
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case "30d":
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
        case "90d":
          startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
          break;
        default:
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      }

      // Get statistics
      const [
        totalSignatures,
        completedSignatures,
        pendingSignatures,
        expiredSignatures,
        statusStats,
        userTypeStats,
      ] = await Promise.all([
        Signature.countDocuments({
          ...rtoFilter(req.rtoId),
          createdAt: { $gte: startDate }
        }),
        Signature.countDocuments({
          ...rtoFilter(req.rtoId),
          status: "completed",
          createdAt: { $gte: startDate }
        }),
        Signature.countDocuments({
          ...rtoFilter(req.rtoId),
          status: "pending",
          createdAt: { $gte: startDate }
        }),
        Signature.countDocuments({
          ...rtoFilter(req.rtoId),
          status: "expired",
          createdAt: { $gte: startDate }
        }),
        Signature.aggregate([
          { $match: { ...rtoFilter(req.rtoId), createdAt: { $gte: startDate } } },
          { $group: { _id: "$status", count: { $sum: 1 } } }
        ]),
        Signature.aggregate([
          { $match: { ...rtoFilter(req.rtoId), createdAt: { $gte: startDate } } },
          { $group: { _id: "$userType", count: { $sum: 1 } } }
        ]),
      ]);

      res.json({
        success: true,
        data: {
          period,
          totalSignatures,
          completedSignatures,
          pendingSignatures,
          expiredSignatures,
          completionRate: totalSignatures > 0 ? Math.round((completedSignatures / totalSignatures) * 100) : 0,
          statusStats,
          userTypeStats,
        },
      });
    } catch (error) {
      logme.error("Get signature stats error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching signature statistics",
        error: error.message,
      });
    }
  },

  // Clean up expired signatures (cron job)
  cleanupExpiredSignatures: async () => {
    try {
      const result = await Signature.updateMany(
        {
          status: "pending",
          expiresAt: { $lt: new Date() }
        },
        {
          $set: { status: "expired" }
        }
      );

      logme.info("Expired signatures cleaned up", {
        updatedCount: result.modifiedCount,
      });

      return result.modifiedCount;
    } catch (error) {
      logme.error("Cleanup expired signatures error:", error);
      throw error;
    }
  },
};

module.exports = signatureController; 