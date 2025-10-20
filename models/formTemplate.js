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
    // LLN Test Configuration
    formType: {
      type: String,
      enum: ['standard', 'lln_test'],
      default: 'standard',
    },
    scoringConfig: {
      enableScoring: {
        type: Boolean,
        default: false,
      },
      scoreFields: [{
        fieldName: {
          type: String,
          required: true,
        },
        label: {
          type: String,
          required: true,
        },
        maxScore: {
          type: Number,
          required: true,
        },
      }],
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("FormTemplate", formTemplateSchema);
