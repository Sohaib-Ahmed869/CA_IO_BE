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
    // Student notifications
    studentRead: {
      type: Boolean,
      default: false,
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
    // Manual Entry Fields
    entryType: {
      type: String,
      enum: ['student_submitted', 'admin_manual'],
      default: 'student_submitted',
    },
    manuallyEnteredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    manuallyEnteredAt: {
      type: Date,
      default: null,
    },
    manualEntryReason: {
      type: String,
      maxLength: 500,
    },
    adminNotes: {
      type: String,
      maxLength: 1000,
    },
    // LLN Test Scoring Fields
    formType: {
      type: String,
      enum: ['standard', 'lln_test'],
      default: 'standard',
    },
    scoringData: {
      isMarked: {
        type: Boolean,
        default: false,
      },
      markedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
      markedAt: {
        type: Date,
      },
      totalScore: {
        type: Number,
        default: 0,
      },
      maxScore: {
        type: Number,
        default: 0,
      },
      percentage: {
        type: Number,
        default: 0,
      },
      scoreBreakdown: [{
        fieldName: {
          type: String,
          required: true,
        },
        label: {
          type: String,
          required: true,
        },
        studentAnswer: {
          type: String,
        },
        score: {
          type: Number,
          default: 0,
        },
        maxScore: {
          type: Number,
          required: true,
        },
        feedback: {
          type: String,
        },
      }],
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("FormSubmission", formSubmissionSchema);
