// models/documentUpload.js
const mongoose = require("mongoose");

const documentUploadSchema = new mongoose.Schema(
  {
    applicationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Application",
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    documents: [
      {
        documentType: {
          type: String,
          required: true,
        },
        category: {
          type: String,
          required: true,
        },
        fileName: {
          type: String,
          required: true,
        },
        originalName: {
          type: String,
          required: true,
        },
        s3Key: {
          type: String,
          required: true,
        },
        s3Bucket: {
          type: String,
          required: true,
        },
        // cloudFrontUrl removed - not needed for this use case
        fileSize: {
          type: Number,
          required: true,
        },
        mimeType: {
          type: String,
          required: true,
        },
        fileExtension: {
          type: String,
          required: true,
        },
        isVerified: {
          type: Boolean,
          default: false,
        },
        verificationStatus: {
          type: String,
          default: "pending",
        },
        verifiedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        verifiedAt: {
          type: Date,
        },
        rejectionReason: {
          type: String,
        },
        uploadedAt: {
          type: Date,
          default: Date.now,
        },
        notes: {
          type: String,
        },
      },
    ],
    status: {
      type: String,
      default: "pending",
    },
    verifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    verifiedAt: {
      type: Date,
    },
    rejectionReason: {
      type: String,
    },
    submittedAt: {
      type: Date,
    },
    version: {
      type: Number,
      default: 1,
    },
  },
  {
    timestamps: true,
  }
);

// Index for better performance
documentUploadSchema.index({ applicationId: 1 });
documentUploadSchema.index({ userId: 1 });
documentUploadSchema.index({ status: 1 });

// Methods
documentUploadSchema.methods.getImageCount = function () {
  return this.documents.filter((doc) => doc.mimeType.startsWith("image/"))
    .length;
};

documentUploadSchema.methods.getVideoCount = function () {
  return this.documents.filter((doc) => doc.mimeType.startsWith("video/"))
    .length;
};

documentUploadSchema.methods.canAddImages = function (count) {
  return this.getImageCount() + count <= 30;
};

documentUploadSchema.methods.canAddVideos = function (count) {
  return this.getVideoCount() + count <= 12;
};

module.exports = mongoose.model("DocumentUpload", documentUploadSchema);
