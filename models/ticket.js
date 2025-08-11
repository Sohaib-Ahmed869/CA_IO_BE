// models/ticket.js
const mongoose = require("mongoose");

const ticketSchema = new mongoose.Schema(
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
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
    },
    category: {
      type: String,
      enum: ["form_issue", "payment", "document", "general", "technical", "assessment"],
      required: true,
    },
    priority: {
      type: String,
      enum: ["low", "medium", "high", "urgent"],
      default: "medium",
    },
    status: {
      type: String,
      enum: ["open", "in_progress", "resolved", "closed"],
      default: "open",
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
        uploadedAt: {
          type: Date,
          default: Date.now,
        },
        fileSize: {
          type: Number,
        },
        mimeType: {
          type: String,
        },
      },
    ],
    // Multi-tenant support
    rtoId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RTO",
    },
    // Tracking fields
    createdAt: {
      type: Date,
      default: Date.now,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
    resolvedAt: {
      type: Date,
      default: null,
    },
    closedAt: {
      type: Date,
      default: null,
    },
    closedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    resolution: {
      type: String,
      trim: true,
      default: null,
    },
    autoAssigned: {
      type: Boolean,
      default: false,
    },
    autoAssignedAt: {
      type: Date,
      default: null,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    lastResponseBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    lastResponseAt: {
      type: Date,
    },
    // SLA tracking
    firstResponseTime: {
      type: Number, // in minutes
      default: null,
    },
    resolutionTime: {
      type: Number, // in minutes
      default: null,
    },
    // Internal tracking
    isEscalated: {
      type: Boolean,
      default: false,
    },
    escalationReason: {
      type: String,
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
ticketSchema.index({ rtoId: 1 });
ticketSchema.index({ userId: 1 });
ticketSchema.index({ applicationId: 1 });
ticketSchema.index({ assignedTo: 1 });
ticketSchema.index({ status: 1 });
ticketSchema.index({ priority: 1 });
ticketSchema.index({ category: 1 });
ticketSchema.index({ createdAt: -1 });
ticketSchema.index({ updatedAt: -1 });

// Pre-save middleware to update timestamps
ticketSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  
  // Set resolvedAt when status changes to resolved
  if (this.isModified("status") && this.status === "resolved" && !this.resolvedAt) {
    this.resolvedAt = new Date();
  }
  
  // Set closedAt when status changes to closed
  if (this.isModified("status") && this.status === "closed" && !this.closedAt) {
    this.closedAt = new Date();
  }
  
  next();
});

module.exports = mongoose.model("Ticket", ticketSchema); 