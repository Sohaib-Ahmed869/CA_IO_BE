// models/ticketMessage.js
const mongoose = require("mongoose");

const ticketMessageSchema = new mongoose.Schema(
  {
    ticketId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Ticket",
      required: true,
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    senderType: {
      type: String,
      enum: ["student", "admin", "assessor", "agent"],
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    isInternal: {
      type: Boolean,
      default: false, // For admin/assessor notes not visible to student
    },
    attachments: [
      {
        filename: {
          type: String,
          required: true,
        },
        s3Key: {
          type: String,
          required: true,
        },
        fileSize: {
          type: Number,
        },
        mimeType: {
          type: String,
        },
        uploadedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    // Multi-tenant support
    rtoId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RTO",
    },
    // Message metadata
    isEdited: {
      type: Boolean,
      default: false,
    },
    editedAt: {
      type: Date,
    },
    editedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    // System messages (for status changes, assignments, etc.)
    isSystemMessage: {
      type: Boolean,
      default: false,
    },
    systemAction: {
      type: String,
      enum: ["status_change", "assignment", "escalation", "priority_change"],
    },
    systemData: {
      type: mongoose.Schema.Types.Mixed, // Store additional data for system messages
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for performance
ticketMessageSchema.index({ ticketId: 1 });
ticketMessageSchema.index({ senderId: 1 });
ticketMessageSchema.index({ rtoId: 1 });
ticketMessageSchema.index({ createdAt: 1 });
ticketMessageSchema.index({ isInternal: 1 });

module.exports = mongoose.model("TicketMessage", ticketMessageSchema); 