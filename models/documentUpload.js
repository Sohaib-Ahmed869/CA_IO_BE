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
        fileName: {
          type: String,
          required: true,
        },
        originalName: {
          type: String,
          required: true,
        },
        filePath: {
          type: String,
          required: true,
        },
        fileSize: {
          type: Number,
          required: true,
        },
        mimeType: {
          type: String,
          required: true,
        },
        uploadedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    status: {
      type: String,
      enum: ["pending", "uploaded", "verified", "rejected"],
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
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("DocumentUpload", documentUploadSchema);
