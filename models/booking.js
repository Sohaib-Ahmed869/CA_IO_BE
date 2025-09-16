const mongoose = require("mongoose");

const bookingSchema = new mongoose.Schema(
  {
    applicationId: { type: mongoose.Schema.Types.ObjectId, ref: "Application", required: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    assessorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    status: {
      type: String,
      enum: [
        "scheduled",
        "reschedule_requested",
        "rescheduled",
        "rejected",
        "cancelled",
        "completed",
      ],
      default: "scheduled",
    },

    scheduledStart: { type: Date, required: true },
    scheduledEnd: { type: Date, required: true },

    requestedStart: { type: Date },
    requestedEnd: { type: Date },

    notes: { type: String, default: "" },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

    audit: [
      {
        action: String, // created | reschedule_requested | reschedule_approved | reschedule_rejected | cancelled | completed
        by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        at: { type: Date, default: Date.now },
        meta: mongoose.Schema.Types.Mixed,
      },
    ],
  },
  { timestamps: true }
);

bookingSchema.index({ assessorId: 1, scheduledStart: 1, scheduledEnd: 1 });
bookingSchema.index({ studentId: 1, scheduledStart: 1, scheduledEnd: 1 });
bookingSchema.index({ applicationId: 1 });

module.exports = mongoose.model("Booking", bookingSchema);
