// models/formSubmission.js
const mongoose = require("mongoose");

const formSubmissionSchema = new mongoose.Schema(
  {
    applicationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Application",
      required: true,
    },
    formTemplateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FormTemplate",
      required: true,
    },
    // Multi-tenant support
    rtoId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RTO",
      // required: false, // Not required for backward compatibility
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    stepNumber: {
      type: Number,
      required: true,
    },
    filledBy: {
      type: String,
      enum: ["user", "assessor", "third-party"],
      required: true,
    },
    formData: {
      type: mongoose.Schema.Types.Mixed, // JSON data of filled form
      required: false,
    },
    status: {
      type: String,
      enum: ["draft", "submitted", "assessed"],
      default: "draft",
    },
    submittedAt: {
      type: Date,
    },
    assessedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    assessedAt: {
      type: Date,
    },
    assessmentNotes: {
      type: String,
    },
    assessed: {
      type: String,
      enum: ["pending", "approved", "requires_changes"],
      default: "pending",
    },
    assessorFeedback: {
      type: String,
    },
    resubmissionRequired: {
      type: Boolean,
      default: false,
    },
    resubmissionDeadline: {
      type: Date,
    },
    previousVersions: [
      {
        formData: mongoose.Schema.Types.Mixed,
        submittedAt: Date,
        version: Number,
      },
    ],
    version: {
      type: Number,
      default: 1,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for performance
formSubmissionSchema.index({ rtoId: 1 });
formSubmissionSchema.index({ applicationId: 1 });
formSubmissionSchema.index({ userId: 1 });
formSubmissionSchema.index({ status: 1 });

module.exports = mongoose.model("FormSubmission", formSubmissionSchema);
