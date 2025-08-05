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
    // Multi-tenant support
    rtoId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RTO",
      // required: true, // Removed to maintain backward compatibility
    },
    // RTO-specific fields
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    category: {
      type: String,
      default: "general",
    },
    tags: [{
      type: String,
      trim: true,
    }],
  },
  {
    timestamps: true,
  }
);

// Indexes for performance
formTemplateSchema.index({ rtoId: 1 });
formTemplateSchema.index({ rtoId: 1, isActive: 1 });
formTemplateSchema.index({ rtoId: 1, filledBy: 1 });
formTemplateSchema.index({ createdBy: 1 });
formTemplateSchema.index({ category: 1 });

module.exports = mongoose.model("FormTemplate", formTemplateSchema);
