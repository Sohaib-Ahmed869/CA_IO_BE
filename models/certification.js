// models/certification.js
const mongoose = require("mongoose");

const certificationSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      // Remove unique constraint since certifications can have same name across different RTOs
    },
    price: {
      type: Number,
      required: true,
    },
    description: {
      type: String,
    },
    formTemplateIds: [
      {
        stepNumber: Number,
        formTemplateId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "FormTemplate",
        },
        filledBy: {
          type: String,
          enum: ["user", "assessor", "mapping", "third-party"],
          required: true,
        },
        title: String,
      },
    ],
    competencyUnits: [
      {
        // Modern structure for Units of Competency
        code: { type: String },
        title: { type: String },
        type: { type: String, enum: ["core", "elective"], default: "core" },
        sequence: { type: Number },
        nominalHours: { type: Number },
        cluster: { type: String },
        // Legacy compatibility (older records might have these)
        name: { type: String },
        description: { type: String },
      },
    ],
    isActive: {
      type: Boolean,
      default: true,
    },
    baseExpense: {
      type: Number,
      default: 0,
    },
    // RTO Context - Reference to the RTO this certification belongs to
    rtoId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RTO",
      required: false, // Made optional for backward compatibility
      index: true,
    },
    // Certification type to identify default vs custom certifications
    certificationType: {
      type: String,
      enum: ["default", "custom"],
      default: "custom",
    },
  },
  {
    timestamps: true,
  }
);

// Add compound index to ensure unique certification names per RTO
certificationSchema.index({ name: 1, rtoId: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model("Certification", certificationSchema);
