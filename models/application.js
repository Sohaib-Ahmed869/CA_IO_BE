// models/application.js
const mongoose = require("mongoose");
const Counter = require("./counter");

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

    certificateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Certificate",
    },
    completedAt: {
      type: Date,
    },
    finalCertificate: {
      s3Key: {
        type: String,
        default: null,
      },
      originalName: {
        type: String,
        default: null,
      },
      uploadedAt: {
        type: Date,
        default: null,
      },
      uploadedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
      },
      certificateNumber: {
        type: String,
        default: null,
      },
      expiryDate: {
        type: Date,
        default: null,
      },
      grade: {
        type: String,
        default: null,
      },
      notes: {
        type: String,
        default: null,
      },
    },
    // CEO acknowledgment gating certificate issuance
    ceoAcknowledged: {
      type: Boolean,
      default: false,
    },
    ceoAcknowledgedAt: {
      type: Date,
      default: null,
    },
    ceoAcknowledgedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    ceoAcknowledgementNotes: {
      type: String,
      default: "",
    },
    overallStatus: {
      type: String,
      enum: [
        "initial_screening",
        "payment_pending",
        "payment_completed",
        "in_progress",
        "under_review", // <- ADD THIS
        "assessment_pending",
        "assessment_completed",
        "certificate_issued",
        "completed",
        "rejected",
      ],
      default: "initial_screening",
    },
    assignedAgent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    callAttempts: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
    },
    contactStatus: {
      type: String,
      enum: [
        "voice_mail",
        "no_pick_up",
        "request_follow_up",
        "picked_up",
        "invalid_number",
      ],
      default: null,
    },
    leadStatus: {
      type: String,
      enum: [
        "warm_lead",
        "hot_lead",
        "cold_lead",
        "proceeded_with_payment",
        "impacted_student",
        "agent",
        "completed",
      ],
      default: null,
    },
    internalNotes: {
      type: String,
      default: "",
    },
    isArchived: {
      type: Boolean,
      default: false,
    },
    archivedAt: {
      type: Date,
    },
    archivedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    restoredAt: {
      type: Date,
    },
    restoredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
  }
);

// Human-friendly application code: RTONAME-######
applicationSchema.add({
  appCode: { type: String, unique: true, sparse: true },
});

applicationSchema.pre("save", async function (next) {
  try {
    if (this.isNew && !this.appCode) {
      // Prefer explicit short code; fallback to sanitized RTO_NAME
      const shortRaw = (process.env.RTO_SHORT || '').toString().trim();
      const rto = shortRaw.length > 0
        ? shortRaw.toUpperCase()
        : (process.env.RTO_NAME || 'CERT').toString().replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 10);
      const ctr = await Counter.findByIdAndUpdate(
        "application",
        { $inc: { seq: 1 } },
        { new: true, upsert: true }
      );
      const num = (ctr.seq || 1).toString().padStart(6, "0");
      this.appCode = `${rto}-${num}`;
    }
    next();
  } catch (err) {
    next(err);
  }
});

// JSON transform to include friendly applicationId
applicationSchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform: function (doc, ret) {
    if (ret.appCode) {
      ret.applicationId = ret.appCode;
    }
    return ret;
  }
});

module.exports = mongoose.model("Application", applicationSchema);
