const mongoose = require("mongoose");

const SURVEY_FORM_EXPIRY_DAYS = Number(
  process.env.SURVEY_FORM_EXPIRY_DAYS || 30
);

const surveyFormRequestSchema = new mongoose.Schema(
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
    token: {
      type: String,
      required: true,
      unique: true,
    },
    status: {
      type: String,
      enum: ["pending", "completed", "expired"],
      default: "pending",
    },
    expiresAt: {
      type: Date,
      required: true,
      default: () =>
        new Date(Date.now() + SURVEY_FORM_EXPIRY_DAYS * 24 * 60 * 60 * 1000),
    },
    sentAt: Date,
    submittedAt: Date,
    formSubmissionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FormSubmission",
    },
  },
  {
    timestamps: true,
  }
);

surveyFormRequestSchema.index({ token: 1 });
surveyFormRequestSchema.index({ applicationId: 1 });
surveyFormRequestSchema.index({ formTemplateId: 1 });
surveyFormRequestSchema.index({ userId: 1 });
surveyFormRequestSchema.index({ status: 1 });
surveyFormRequestSchema.index({ expiresAt: 1 });

module.exports = mongoose.model("SurveyFormRequest", surveyFormRequestSchema);

