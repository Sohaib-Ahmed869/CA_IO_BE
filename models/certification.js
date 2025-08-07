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
          enum: ["user", "assessor", "mapping", "third-party"],
          required: true,
        },
        title: String,
      },
    ],
    isActive: { type: Boolean, default: true },
    deletedAt: { type: Date, default: null }, // Soft delete tracking
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    // Multi-tenant support
    rtoId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RTO",
      required: false, // Not required for backward compatibility
    },
    category: {
      type: String,
      default: "general",
    },
    tags: [{
      type: String,
      trim: true,
    }],
    code: {
      type: String,
      trim: true,
    },
    duration: {
      type: String,
      default: "12 months",
    },
    prerequisites: {
      type: String,
    },
    competencyUnits: [
      {
        name: {
          type: String,
          required: true,
        },
        description: {
          type: String,
          required: true,
        },
      },
    ],
  },
  {
    timestamps: true,
  }
);

// Indexes for performance
certificationSchema.index({ rtoId: 1 });
certificationSchema.index({ rtoId: 1, isActive: 1 });
certificationSchema.index({ rtoId: 1, name: 1 });
certificationSchema.index({ createdBy: 1 });
certificationSchema.index({ category: 1 });

module.exports = mongoose.model("Certification", certificationSchema);
