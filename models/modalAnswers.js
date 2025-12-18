const mongoose = require("mongoose");

const modalAnswersSchema = new mongoose.Schema(
  {
    certificationId: { type: mongoose.Schema.Types.ObjectId, ref: "Certification", required: true, unique: true },
    answers: { type: mongoose.Schema.Types.Mixed, required: true },
    version: { type: Number, default: 1 },
    isActive: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

modalAnswersSchema.index({ certificationId: 1 }, { unique: true });

module.exports = mongoose.model("ModalAnswers", modalAnswersSchema);
