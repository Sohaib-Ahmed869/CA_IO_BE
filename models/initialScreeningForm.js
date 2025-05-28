// models/initialScreeningForm.js
const mongoose = require("mongoose");

const initialScreeningFormSchema = new mongoose.Schema(
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
    workExperienceYears: {
      type: Number,
      required: true,
    },
    workExperienceLocation: {
      type: String,
      required: true,
    },
    currentState: {
      type: String,
      required: true,
    },
    hasFormalQualifications: {
      type: Boolean,
      required: true,
    },
    formalQualificationsDetails: {
      type: String,
    },
    status: {
      type: String,
      enum: ["draft", "submitted", "approved", "rejected"],
      default: "draft",
    },
    submittedAt: {
      type: Date,
    },
    reviewedAt: {
      type: Date,
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model(
  "InitialScreeningForm",
  initialScreeningFormSchema
);
