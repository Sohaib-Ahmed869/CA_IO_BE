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
