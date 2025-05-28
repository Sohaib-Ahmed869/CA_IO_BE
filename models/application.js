// models/application.js
const mongoose = require("mongoose");

const applicationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    certificationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Certification",
      required: true,
    },
    initialScreeningFormId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "InitialScreeningForm",
      required: true,
    },
    paymentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Payment",
    },
    formSubmissions: [
      {
        stepNumber: Number,
        formTemplateId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "FormTemplate",
        },
        formSubmissionId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "FormSubmission",
        },
        status: {
          type: String,
          enum: ["pending", "in_progress", "completed", "assessed"],
          default: "pending",
        },
        assessedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        assessedAt: Date,
      },
    ],
    documentUploadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DocumentUpload",
    },
    assignedAssessor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    currentStep: {
      type: Number,
      default: 1,
    },
    overallStatus: {
      type: String,
      enum: [
        "initial_screening",
        "payment_pending",
        "payment_completed",
        "in_progress",
        "assessment_pending",
        "assessment_completed",
        "certificate_issued",
        "completed",
        "rejected",
      ],
      default: "initial_screening",
    },
    certificateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Certificate",
    },
    completedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Application", applicationSchema);
