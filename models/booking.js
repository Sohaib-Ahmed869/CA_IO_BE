// models/booking.js
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
        "cancelled",
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
        at: { type: Date, default: Date.now },
        by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        action: { type: String },
        details: { type: Object },
      },
    ],
  },
  { timestamps: true }
);

// Indexes for conflict detection and common queries
bookingSchema.index({ assessorId: 1, scheduledStart: 1, scheduledEnd: 1 });
bookingSchema.index({ studentId: 1, scheduledStart: 1, scheduledEnd: 1 });
bookingSchema.index({ applicationId: 1, scheduledStart: 1 });

module.exports = mongoose.model("Booking", bookingSchema);


