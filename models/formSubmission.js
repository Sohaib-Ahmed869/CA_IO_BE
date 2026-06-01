// models/formSubmission.js
const mongoose = require("mongoose");

// Coerce values assigned to Date paths. Guards against legacy bugs that wrote
// an empty object `{}` (or other non-date junk) into a Date field, which would
// later throw a CastError when Mongoose hydrates the document. Valid dates and
// parseable strings/numbers pass through; anything else becomes undefined so it
// is simply not stored. (Setters run on assignment, not on init, so this
// prevents new corruption rather than masking existing bad data — the
// formSubmissionDateRepair util handles cleanup of already-stored values.)
const coerceDate = (v) => {
  if (v === null || v === undefined) return v;
  if (v instanceof Date) return v;
  if (typeof v === "string" || typeof v === "number") {
    const d = new Date(v);
    return isNaN(d.getTime()) ? undefined : d;
  }
  // Objects (e.g. {}), arrays, booleans — reject rather than persist garbage.
  return undefined;
};

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
      enum: ["user", "assessor", "third-party", "tpr-verifier", "third-party-verifier","survey-user"],
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
      set: coerceDate,
    },
    assessedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    assessedAt: {
      type: Date,
      set: coerceDate,
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
      set: coerceDate,
    },
    assessorFormData: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    assessorFilledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    assessorFilledAt: {
      type: Date,
      set: coerceDate,
    },
    assessorStatus: {
      type: String,
      enum: ["draft", "submitted"],
      default: "draft",
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
    // LLN Test scoring fields
    formType: { 
      type: String, 
      enum: ['standard', 'lln_test'], 
      default: 'standard' 
    },
    scoringData: {
      isMarked: { type: Boolean, default: false },
      markedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      markedAt: Date,
      totalScore: Number,
      maxScore: Number,
      percentage: Number,
      scoreBreakdown: [{
        fieldName: String,
        label: String,
        studentAnswer: String,
        score: Number,
        maxScore: Number,
        feedback: String
      }]
    }
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("FormSubmission", formSubmissionSchema);
