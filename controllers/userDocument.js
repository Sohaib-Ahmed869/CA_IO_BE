// models/userDocument.js
const mongoose = require("mongoose");

const userDocumentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    applicationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Application",
      required: true,
    },
    certificationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Certification",
      required: true,
    },
    documentTitle: {
      type: String,
      required: true,
    },
    documentContent: {
      type: String,
      required: true, // This will store the filled document content
    },
    documentType: {
      type: String,
      enum: [
        "application_form",
        "personal_statement",
        "work_experience",
        "qualification_document",
        "other",
      ],
      default: "other",
    },
    status: {
      type: String,
      enum: ["draft", "submitted", "under_review", "approved", "rejected"],
      default: "draft",
    },
    adminNotes: {
      type: String,
      default: "",
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
    submittedAt: {
      type: Date,
      default: null,
    },
    version: {
      type: Number,
      default: 1,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    metadata: {
      wordCount: {
        type: Number,
        default: 0,
      },
      lastEditedAt: {
        type: Date,
        default: Date.now,
      },
      category: String,
      tags: [String],
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for better performance
userDocumentSchema.index({ userId: 1, applicationId: 1 });
userDocumentSchema.index({ formId: 1 });
userDocumentSchema.index({ certificationId: 1 });
userDocumentSchema.index({ status: 1 });

// Pre-save middleware to update metadata
userDocumentSchema.pre("save", function (next) {
  if (this.documentContent) {
    this.metadata.wordCount = this.documentContent
      .split(/\s+/)
      .filter((word) => word.length > 0).length;
    this.metadata.lastEditedAt = new Date();
  }

  if (this.status === "submitted" && !this.submittedAt) {
    this.submittedAt = new Date();
  }

  next();
});

module.exports = mongoose.model("UserDocument", userDocumentSchema);
