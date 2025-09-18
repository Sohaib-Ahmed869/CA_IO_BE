// models/thirdPartyFormSubmission.js
const mongoose = require("mongoose");

const thirdPartyFormSubmissionSchema = new mongoose.Schema(
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
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // Third party details
    employerName: {
      type: String,
      required: true,
    },
    employerEmail: {
      type: String,
      required: true,
    },
    referenceName: {
      type: String,
      required: true,
    },
    referenceEmail: {
      type: String,
      required: true,
    },
    // Form submissions
    employerSubmission: {
      formData: {
        type: Map,
        of: mongoose.Schema.Types.Mixed,
        default: {},
      },
      submittedAt: Date,
      ipAddress: String,
      userAgent: String,
      isSubmitted: {
        type: Boolean,
        default: false,
      },
    },
    referenceSubmission: {
      formData: {
        type: Map,
        of: mongoose.Schema.Types.Mixed,
        default: {},
      },
      submittedAt: Date,
      ipAddress: String,
      userAgent: String,
      isSubmitted: {
        type: Boolean,
        default: false,
      },
    },
    // Combined data if same email
    combinedSubmission: {
      formData: {
        type: mongoose.Schema.Types.Mixed, // JSON data of filled form
        required: false,
      },
      submittedAt: Date,
      ipAddress: String,
      userAgent: String,
      isSubmitted: {
        type: Boolean,
        default: false,
      },
    },
    // Status tracking
    status: {
      type: String,
      enum: ["pending", "partially_completed", "completed"],
      default: "pending",
    },
    // Tokens for secure access
    employerToken: {
      type: String,
      required: true,
      unique: true,
    },
    referenceToken: {
      type: String,
      required: true,
    },
    combinedToken: String, // Used when emails are same
    // Email tracking
    employerEmailSent: {
      type: Boolean,
      default: false,
    },
    referenceEmailSent: {
      type: Boolean,
      default: false,
    },
    combinedEmailSent: {
      type: Boolean,
      default: false,
    },
    // Verification tracking (added)
    verification: {
      shortCode: String,
      employer: {
        token: String,
        sentAt: Date,
        verifiedAt: Date,
        status: { type: String, enum: ["pending", "verified", "rejected", "not_sent"], default: "not_sent" },
        lastSentSubject: String,
        lastSentContent: String,
        lastSentMessageId: String,
        responseContent: String,
      },
      reference: {
        token: String,
        sentAt: Date,
        verifiedAt: Date,
        status: { type: String, enum: ["pending", "verified", "rejected", "not_sent"], default: "not_sent" },
        lastSentSubject: String,
        lastSentContent: String,
        lastSentMessageId: String,
        responseContent: String,
      },
      combined: {
        token: String,
        sentAt: Date,
        verifiedAt: Date,
        status: { type: String, enum: ["pending", "verified", "rejected", "not_sent"], default: "not_sent" },
        lastSentSubject: String,
        lastSentContent: String,
        lastSentMessageId: String,
        responseContent: String,
      },
    },
    verificationStatus: { type: String, enum: ["pending", "verified", "rejected", "none"], default: "none" },
    // Expiry
    expiresAt: {
      type: Date,
      required: true,
      default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    },
    // Metadata
    stepNumber: Number,
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
thirdPartyFormSubmissionSchema.index({ employerToken: 1 });
thirdPartyFormSubmissionSchema.index({ referenceToken: 1 });
thirdPartyFormSubmissionSchema.index({ combinedToken: 1 });
thirdPartyFormSubmissionSchema.index({ applicationId: 1 });
thirdPartyFormSubmissionSchema.index({ expiresAt: 1 });
thirdPartyFormSubmissionSchema.index({ "verification.shortCode": 1 });
thirdPartyFormSubmissionSchema.index({ "verification.employer.token": 1 });
thirdPartyFormSubmissionSchema.index({ "verification.reference.token": 1 });
thirdPartyFormSubmissionSchema.index({ "verification.combined.token": 1 });
thirdPartyFormSubmissionSchema.index({ "verification.employer.lastSentMessageId": 1 });
thirdPartyFormSubmissionSchema.index({ "verification.reference.lastSentMessageId": 1 });
thirdPartyFormSubmissionSchema.index({ "verification.combined.lastSentMessageId": 1 });

// Check if both emails are the same
thirdPartyFormSubmissionSchema.virtual("isSameEmail").get(function () {
  const a = (this.employerEmail || '').toLowerCase();
  const b = (this.referenceEmail || '').toLowerCase();
  if (!a || !b) return false;
  return a === b;
});

// Check if form is fully completed
thirdPartyFormSubmissionSchema.virtual("isFullyCompleted").get(function () {
  if (this.isSameEmail) {
    return this.combinedSubmission.isSubmitted;
  }
  return (
    this.employerSubmission.isSubmitted && this.referenceSubmission.isSubmitted
  );
});

module.exports = mongoose.model(
  "ThirdPartyFormSubmission",
  thirdPartyFormSubmissionSchema
);
