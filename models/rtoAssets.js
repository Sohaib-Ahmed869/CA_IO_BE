const mongoose = require("mongoose");

const documentSchema = new mongoose.Schema({
  title: { type: String, required: true },
  type: { type: String, required: true },
  description: { type: String, default: "" },
  url: { type: String, required: true },
  key: { type: String, required: true },
  uploadedAt: { type: Date, default: Date.now },
  originalName: { type: String, required: true },
  fileSize: { type: Number, required: true },
  mimeType: { type: String, required: true },
  isActive: { type: Boolean, default: true },
}, { _id: true });

const logoSchema = new mongoose.Schema({
  url: { type: String, required: true },
  key: { type: String, required: true },
  uploadedAt: { type: Date, default: Date.now },
  originalName: { type: String, required: true },
  fileSize: { type: Number, required: true },
  mimeType: { type: String, required: true },
  isActive: { type: Boolean, default: true },
}, { _id: false });

const rtoAssetsSchema = new mongoose.Schema(
  {
    rtoId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RTO",
      required: true,
    },
    logo: logoSchema,
    documents: [documentSchema],
  },
  { timestamps: true }
);

// Index for efficient queries
rtoAssetsSchema.index({ rtoId: 1 });

// Virtual for getting the latest active logo
rtoAssetsSchema.virtual("latestLogo").get(function () {
  if (this.logo && this.logo.isActive) {
    return this.logo;
  }
  return null;
});

// Virtual for getting active documents
rtoAssetsSchema.virtual("activeDocuments").get(function () {
  return this.documents.filter(doc => doc.isActive);
});

const RTOAssets = mongoose.model("RTOAssets", rtoAssetsSchema);

module.exports = RTOAssets; 