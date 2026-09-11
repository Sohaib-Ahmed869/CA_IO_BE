// models/supportTicket.js
const mongoose = require("mongoose");
const Counter = require("./counter");

const TICKET_STATUSES = [
  "open",
  "in_progress",
  "waiting",
  "resolved",
  "closed",
  "escalated",
];

const TICKET_PRIORITIES = ["low", "medium", "high", "urgent"];

const TICKET_TYPES = ["issue", "query"];

const TICKET_CATEGORIES = [
  "student_intake_form",
  "documents",
  "payments",
  "technical",
  "rto_support",
  "other",
];

// Where the ticket came from - drives the "Reference - where tickets come from"
// table in the support docs.
const TICKET_SOURCES = ["student", "chatbot", "rto", "portal"];

const attachmentSchema = new mongoose.Schema(
  {
    fileName: String,
    s3Key: String,
    url: String,
    mimeType: String,
    size: Number,
  },
  { _id: false }
);

const messageSchema = new mongoose.Schema(
  {
    sender: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    senderRole: String,
    body: { type: String, default: "" },
    attachments: [attachmentSchema],
    links: [String],
    // Internal notes are visible to staff only and are filtered out of every
    // response served to the student or assessor who raised the ticket.
    isInternal: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const supportTicketSchema = new mongoose.Schema(
  {
    ticketNumber: { type: String, unique: true, index: true },

    raisedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    // Snapshot of the raiser's userType at creation time, so the queue can be
    // filtered by audience even if the account changes role later.
    raisedByRole: String,

    type: { type: String, enum: TICKET_TYPES, default: "query" },
    category: { type: String, enum: TICKET_CATEGORIES, default: "other" },
    source: { type: String, enum: TICKET_SOURCES, default: "student" },

    applicationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Application",
      default: null,
    },

    title: { type: String, required: true, trim: true },
    description: { type: String, required: true },

    attachments: [attachmentSchema],
    links: [String],

    status: { type: String, enum: TICKET_STATUSES, default: "open", index: true },
    priority: { type: String, enum: TICKET_PRIORITIES, default: "medium" },

    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },

    messages: [messageSchema],

    // Populated when a ticket is escalated out of an assistant conversation, so
    // the agent opens the ticket with the chat already attached.
    chatTranscript: [
      {
        role: String,
        content: String,
        at: { type: Date, default: Date.now },
      },
    ],

    // KPI timestamps - the support dashboard derives response/resolution times
    // from these rather than recomputing them from the message list.
    firstResponseAt: { type: Date, default: null },
    resolvedAt: { type: Date, default: null },
    closedAt: { type: Date, default: null },
    resolutionMessage: { type: String, default: "" },

    lastActivityAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true }
);

supportTicketSchema.index({ status: 1, createdAt: -1 });
supportTicketSchema.index({ title: "text", description: "text" });

// Sequential, human-quotable ticket numbers (TKT-000001) via the shared Counter
// collection, matching how other sequences in the app are allocated.
supportTicketSchema.pre("save", async function assignTicketNumber(next) {
  if (this.ticketNumber) return next();
  try {
    const counter = await Counter.findByIdAndUpdate(
      "supportTicket",
      { $inc: { seq: 1 } },
      { new: true, upsert: true }
    );
    this.ticketNumber = `TKT-${String(counter.seq).padStart(6, "0")}`;
    next();
  } catch (error) {
    next(error);
  }
});

module.exports = mongoose.model("SupportTicket", supportTicketSchema);
module.exports.TICKET_STATUSES = TICKET_STATUSES;
module.exports.TICKET_PRIORITIES = TICKET_PRIORITIES;
module.exports.TICKET_TYPES = TICKET_TYPES;
module.exports.TICKET_CATEGORIES = TICKET_CATEGORIES;
module.exports.TICKET_SOURCES = TICKET_SOURCES;
