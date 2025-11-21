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
      enum: ["user", "assessor", "mapping", "third-party", "tpr-verifier", "third-party-verifier"],
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
    // LLN Test configuration
    formType: { 
      type: String, 
      enum: ['standard', 'lln_test'], 
      default: 'standard' 
    },
    scoringConfig: {
      enableScoring: { type: Boolean, default: false },
      scoreFields: [{ 
        fieldName: String, 
        label: String, 
        maxScore: Number 
      }]
    }
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("FormTemplate", formTemplateSchema);
