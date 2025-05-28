// models/certificate.js
const mongoose = require("mongoose");

const certificateSchema = new mongoose.Schema(
  {
    applicationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Application",
      required: true,
    },
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
    certificateNumber: {
      type: String,
      unique: true,
      required: true,
    },
    certificateFileName: {
      type: String,
      required: true,
    },
    certificateFilePath: {
      type: String,
      required: true,
    },
    issuedAt: {
      type: Date,
      default: Date.now,
    },
    issuedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    expiresAt: {
      type: Date,
    },
    status: {
      type: String,
      enum: ["active", "expired", "revoked"],
      default: "active",
    },
    revokedAt: {
      type: Date,
    },
    revokedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    revocationReason: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

// Generate certificate number before saving
certificateSchema.pre("save", async function (next) {
  if (!this.certificateNumber) {
    const count = await this.constructor.countDocuments();
    this.certificateNumber = `CERT-${Date.now()}-${count + 1}`;
  }
  next();
});

module.exports = mongoose.model("Certificate", certificateSchema);
