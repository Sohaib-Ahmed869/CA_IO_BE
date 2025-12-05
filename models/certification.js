// models/certification.js
const mongoose = require("mongoose");

const certificationSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
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
          enum: ["user", "assessor", "mapping", "third-party", "tpr-verifier", "third-party-verifier"],
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
    // Additional document list (e.g., supporting docs required per certification)
    docs: [
      {
        name: { type: String },
        description: { type: String },
        type: { type: String }, // optional categorization
        required: { type: Boolean, default: false },
        url: { type: String }, // optional reference
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
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Certification", certificationSchema);
