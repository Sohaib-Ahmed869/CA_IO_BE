// models/signature.js
const mongoose = require("mongoose");

const signatureSchema = new mongoose.Schema(
  {
    formId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FormTemplate",
      required: true,
    },
    submissionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FormSubmission",
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    userType: {
      type: String,
      enum: ["student", "assessor", "admin", "thirdparty"],
      required: true,
    },
    signatureData: {
      type: String, // Base64 or URL
      required: false, // pending requests won't have data yet
    },
    signatureType: {
      type: String,
      enum: ["draw", "upload", "typed"],
      default: "draw",
    },
    status: {
      type: String,
      enum: ["pending", "completed", "expired", "cancelled"],
      default: "pending",
    },
    signedAt: {
      type: Date,
      default: null,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    ipAddress: {
      type: String,
    },
    userAgent: {
      type: String,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    // Multi-tenant support
    rtoId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RTO",
    },
    // Signature field information
    fieldName: {
      type: String,
      required: true, // e.g., "student_signature", "assessor_signature"
    },
    fieldLabel: {
      type: String,
      required: true, // e.g., "Student Signature", "Assessor Signature"
    },
    // Verification and audit
    verificationHash: {
      type: String, // For signature integrity verification
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    verifiedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Instance helpers
signatureSchema.methods.isExpired = function isExpired() {
  return Boolean(this.expiresAt && this.expiresAt.getTime() < Date.now());
};

signatureSchema.methods.validateSignature = function validateSignature() {
  if (this.status !== "completed") {
    return { valid: false, reason: "Signature not completed" };
  }
  if (!this.signatureData) {
    return { valid: false, reason: "Missing signature data" };
  }
  if (this.isExpired()) {
    return { valid: false, reason: "Signature expired" };
  }
  return { valid: true };
};

// Indexes for performance
signatureSchema.index({ formId: 1 });
signatureSchema.index({ submissionId: 1 });
signatureSchema.index({ userId: 1 });
signatureSchema.index({ rtoId: 1 });
signatureSchema.index({ status: 1 });
signatureSchema.index({ expiresAt: 1 });
signatureSchema.index({ fieldName: 1 });

module.exports = mongoose.model("Signature", signatureSchema);
