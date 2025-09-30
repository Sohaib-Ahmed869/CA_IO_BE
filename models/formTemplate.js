// models/formTemplate.js
const mongoose = require("mongoose");

const formTemplateSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    description: {
      type: String,
    },
    stepNumber: {
      type: Number,
      required: true,
    },
    filledBy: {
      type: String,
      enum: ["user", "assessor", "mapping", "third-party"],
      required: true,
    },
    formStructure: {
      type: mongoose.Schema.Types.Mixed, // JSON structure for form fields
      required: true,
    },
    version: {
      type: Number,
      default: 1,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    // RTO Context - Reference to the RTO this form belongs to
    rtoId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RTO",
      required: false, // Made optional for backward compatibility
      index: true,
    },
    // Template type to identify default vs custom forms
    templateType: {
      type: String,
      enum: ["default", "custom"],
      default: "custom",
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("FormTemplate", formTemplateSchema);
