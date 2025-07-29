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
    // Multi-tenant support
    rtoId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RTO",
      // required: false, // Not required for backward compatibility
    },
    workExperienceYears: {
      type: String,
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

// Indexes for performance
initialScreeningFormSchema.index({ rtoId: 1 });
initialScreeningFormSchema.index({ userId: 1 });
initialScreeningFormSchema.index({ certificationId: 1 });
initialScreeningFormSchema.index({ status: 1 });

module.exports = mongoose.model(
  "InitialScreeningForm",
  initialScreeningFormSchema
);
