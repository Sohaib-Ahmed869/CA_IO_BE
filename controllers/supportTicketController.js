// controllers/supportTicketController.js
const mongoose = require("mongoose");
const SupportTicket = require("../models/supportTicket");
const {
  TICKET_STATUSES,
  TICKET_PRIORITIES,
  TICKET_TYPES,
  TICKET_CATEGORIES,
} = require("../models/supportTicket");
const User = require("../models/user");
const emailService = require("../services/emailService2");
const { generatePresignedUrl } = require("../config/s3Config");

// Roles that can see the whole queue, post internal notes, assign and resolve.
const SUPPORT_ROLES = ["admin", "super_admin", "support"];

const isSupportStaff = (user) => SUPPORT_ROLES.includes(user?.userType);

// A ticket raised from the assessor portal is an "rto" ticket, one raised by a
// staff member on a student's behalf is "portal", everything else is "student".
const sourceForRole = (userType) => {
  if (userType === "assessor") return "rto";
  if (SUPPORT_ROLES.includes(userType)) return "portal";
  return "student";
};

// Multipart form fields arrive as strings; links may be a JSON array, a single
// value, or a newline/comma separated list typed into one box.
const parseLinks = (raw) => {
  if (!raw) return [];
  let candidates = [];

  if (Array.isArray(raw)) {
    candidates = raw;
  } else if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (trimmed.startsWith("[")) {
      try {
        const parsed = JSON.parse(trimmed);
        candidates = Array.isArray(parsed) ? parsed : [];
      } catch (_) {
        candidates = trimmed.split(/[\n,]+/);
      }
    } else {
      candidates = trimmed.split(/[\n,]+/);
    }
  }

  return candidates
    .map((link) => String(link || "").trim())
    .filter(Boolean)
    .slice(0, 20);
};

const parseTranscript = (raw) => {
  if (!raw) return [];
  let parsed = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch (_) {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter((entry) => entry && entry.content)
    .map((entry) => ({
      role: String(entry.role || "assistant"),
      content: String(entry.content),
      at: entry.at ? new Date(entry.at) : new Date(),
    }));
};

// multer-s3 hands back `key`/`location`; keep the key so URLs can be re-signed
// later rather than baking a possibly-expiring URL into the document.
const mapUploadedFiles = async (files = []) => {
  const mapped = [];
  for (const file of files) {
    let url = file.location || "";
    try {
      if (file.key) url = await generatePresignedUrl(file.key);
    } catch (error) {
      console.error("Support attachment URL error:", error.message);
    }
    mapped.push({
      fileName: file.originalname,
      s3Key: file.key,
      url,
      mimeType: file.mimetype,
      size: file.size,
    });
  }
  return mapped;
};

// Students and assessors must never receive internal notes.
const stripInternalNotes = (ticket) => {
  const plain = ticket.toObject ? ticket.toObject() : ticket;
  return {
    ...plain,
    messages: (plain.messages || []).filter((m) => !m.isInternal),
  };
};

const canViewTicket = (ticket, user) => {
  if (isSupportStaff(user)) return true;
  return String(ticket.raisedBy?._id || ticket.raisedBy) === String(user._id);
};

const notifyByEmail = async (to, subject, html) => {
  if (!to) return;
  try {
    await emailService.sendEmail(to, subject, html);
  } catch (error) {
    // A failed notification must never fail the ticket operation itself.
    console.error("Support ticket email failed:", error.message);
  }
};

const ticketEmailBody = (heading, ticket, bodyText) => `
  <div style="font-family:Arial,sans-serif;color:#111827">
    <h2 style="margin:0 0 12px">${heading}</h2>
    <p style="margin:0 0 8px"><strong>Ticket:</strong> ${ticket.ticketNumber}</p>
    <p style="margin:0 0 8px"><strong>Subject:</strong> ${ticket.title}</p>
    <p style="margin:0 0 16px"><strong>Status:</strong> ${ticket.status}</p>
    <div style="padding:12px;background:#f3f4f6;border-radius:8px">${bodyText}</div>
  </div>`;

const supportTicketController = {
  // ---------------------------------------------------------------------------
  // Student / assessor side
  // ---------------------------------------------------------------------------

  createTicket: async (req, res) => {
    try {
      const {
        title,
        description,
        type,
        category,
        applicationId,
        priority,
        source,
        links,
        chatTranscript,
        raisedFor,
      } = req.body;

      if (!title || !description) {
        return res.status(400).json({
          success: false,
          message: "Title and description are required",
        });
      }

      // Staff can open a ticket on a student's behalf (e.g. after a phone call).
      let raisedBy = req.user._id;
      let raisedByRole = req.user.userType;
      if (raisedFor && isSupportStaff(req.user)) {
        const target = await User.findById(raisedFor).select("userType");
        if (target) {
          raisedBy = target._id;
          raisedByRole = target.userType;
        }
      }

      const attachments = await mapUploadedFiles(req.files);

      const ticket = new SupportTicket({
        raisedBy,
        raisedByRole,
        title: String(title).trim(),
        description: String(description),
        type: TICKET_TYPES.includes(type) ? type : "query",
        category: TICKET_CATEGORIES.includes(category) ? category : "other",
        priority: TICKET_PRIORITIES.includes(priority) ? priority : "medium",
        source: source === "chatbot" ? "chatbot" : sourceForRole(req.user.userType),
        applicationId:
          applicationId && mongoose.Types.ObjectId.isValid(applicationId)
            ? applicationId
            : null,
        attachments,
        links: parseLinks(links),
        chatTranscript: parseTranscript(chatTranscript),
        lastActivityAt: new Date(),
      });

      await ticket.save();

      const populated = await SupportTicket.findById(ticket._id)
        .populate("raisedBy", "firstName lastName email userType")
        .populate("applicationId", "certificationId overallStatus");

      res.status(201).json({
        success: true,
        message: "Support ticket created",
        data: stripInternalNotes(populated),
      });
    } catch (error) {
      console.error("Create support ticket error:", error);
      res.status(500).json({
        success: false,
        message: "Error creating support ticket",
      });
    }
  },

  getMyTickets: async (req, res) => {
    try {
      const { status } = req.query;
      const query = { raisedBy: req.user._id };
      if (status && status !== "all" && TICKET_STATUSES.includes(status)) {
        query.status = status;
      }

      const tickets = await SupportTicket.find(query)
        .populate("assignedTo", "firstName lastName")
        .populate("applicationId", "certificationId")
        .sort({ lastActivityAt: -1 })
        .lean();

      // The list view only needs a reply count, not the thread itself.
      const data = tickets.map((ticket) => ({
        ...ticket,
        messages: undefined,
        messageCount: (ticket.messages || []).filter((m) => !m.isInternal).length,
      }));

      res.json({ success: true, data });
    } catch (error) {
      console.error("Get my tickets error:", error);
      res.status(500).json({ success: false, message: "Error fetching tickets" });
    }
  },

  getTicketById: async (req, res) => {
    try {
      const ticket = await SupportTicket.findById(req.params.id)
        .populate("raisedBy", "firstName lastName email userType phoneNumber")
        .populate("assignedTo", "firstName lastName email")
        .populate("messages.sender", "firstName lastName userType")
        .populate({
          path: "applicationId",
          select: "certificationId overallStatus",
          populate: { path: "certificationId", select: "name" },
        });

      if (!ticket) {
        return res
          .status(404)
          .json({ success: false, message: "Ticket not found" });
      }

      if (!canViewTicket(ticket, req.user)) {
        return res
          .status(403)
          .json({ success: false, message: "Not authorised to view this ticket" });
      }

      const data = isSupportStaff(req.user)
        ? ticket.toObject()
        : stripInternalNotes(ticket);

      res.json({ success: true, data });
    } catch (error) {
      console.error("Get ticket error:", error);
      res.status(500).json({ success: false, message: "Error fetching ticket" });
    }
  },

  addMessage: async (req, res) => {
    try {
      const { body, links, isInternal } = req.body;
      const ticket = await SupportTicket.findById(req.params.id).populate(
        "raisedBy",
        "firstName lastName email"
      );

      if (!ticket) {
        return res
          .status(404)
          .json({ success: false, message: "Ticket not found" });
      }

      if (!canViewTicket(ticket, req.user)) {
        return res
          .status(403)
          .json({ success: false, message: "Not authorised to reply" });
      }

      // Once a ticket is closed the thread stands as a clean record.
      if (ticket.status === "closed" && !isSupportStaff(req.user)) {
        return res.status(400).json({
          success: false,
          message: "This ticket is closed and can no longer be replied to",
        });
      }

      const attachments = await mapUploadedFiles(req.files);
      const internal = String(isInternal) === "true" && isSupportStaff(req.user);

      if (!body && attachments.length === 0) {
        return res
          .status(400)
          .json({ success: false, message: "A message or attachment is required" });
      }

      ticket.messages.push({
        sender: req.user._id,
        senderRole: req.user.userType,
        body: body || "",
        attachments,
        links: parseLinks(links),
        isInternal: internal,
        createdAt: new Date(),
      });

      if (!internal) {
        ticket.lastActivityAt = new Date();

        if (isSupportStaff(req.user)) {
          // First staff reply stops the response-time clock.
          if (!ticket.firstResponseAt) ticket.firstResponseAt = new Date();
          if (ticket.status === "open") ticket.status = "in_progress";
        } else if (ticket.status === "waiting") {
          // Customer came back to us - it's our move again.
          ticket.status = "in_progress";
        }
      }

      await ticket.save();

      if (!internal) {
        if (isSupportStaff(req.user)) {
          await notifyByEmail(
            ticket.raisedBy?.email,
            `Update on your support request ${ticket.ticketNumber}`,
            ticketEmailBody(
              "You have a new reply from support",
              ticket,
              body || "An attachment was added to your ticket."
            )
          );
        }
      }

      const updated = await SupportTicket.findById(ticket._id)
        .populate("raisedBy", "firstName lastName email userType")
        .populate("assignedTo", "firstName lastName email")
        .populate("messages.sender", "firstName lastName userType");

      res.json({
        success: true,
        message: internal ? "Internal note added" : "Reply sent",
        data: isSupportStaff(req.user)
          ? updated.toObject()
          : stripInternalNotes(updated),
      });
    } catch (error) {
      console.error("Add ticket message error:", error);
      res.status(500).json({ success: false, message: "Error adding message" });
    }
  },

  // ---------------------------------------------------------------------------
  // Admin / support side
  // ---------------------------------------------------------------------------

  listTickets: async (req, res) => {
    try {
      const {
        status,
        type,
        category,
        priority,
        source,
        assignedTo,
        q,
        page = 1,
        limit = 25,
      } = req.query;

      const query = {};
      if (status && status !== "all" && TICKET_STATUSES.includes(status)) {
        query.status = status;
      }
      if (type && type !== "all" && TICKET_TYPES.includes(type)) query.type = type;
      if (category && category !== "all" && TICKET_CATEGORIES.includes(category)) {
        query.category = category;
      }
      if (priority && priority !== "all" && TICKET_PRIORITIES.includes(priority)) {
        query.priority = priority;
      }
      if (source && source !== "all") query.source = source;
      if (assignedTo === "unassigned") {
        query.assignedTo = null;
      } else if (assignedTo === "me") {
        query.assignedTo = req.user._id;
      } else if (assignedTo && mongoose.Types.ObjectId.isValid(assignedTo)) {
        query.assignedTo = assignedTo;
      }

      if (q) {
        const escaped = String(q).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const rx = new RegExp(escaped, "i");
        query.$or = [{ title: rx }, { description: rx }, { ticketNumber: rx }];
      }

      const pageNum = Math.max(1, parseInt(page, 10) || 1);
      const perPage = Math.min(100, Math.max(1, parseInt(limit, 10) || 25));

      const [tickets, total] = await Promise.all([
        SupportTicket.find(query)
          .populate("raisedBy", "firstName lastName email userType")
          .populate("assignedTo", "firstName lastName")
          .sort({ lastActivityAt: -1 })
          .skip((pageNum - 1) * perPage)
          .limit(perPage)
          .lean(),
        SupportTicket.countDocuments(query),
      ]);

      const data = tickets.map((ticket) => ({
        ...ticket,
        messages: undefined,
        messageCount: (ticket.messages || []).length,
      }));

      res.json({
        success: true,
        data,
        pagination: {
          page: pageNum,
          limit: perPage,
          total,
          pages: Math.ceil(total / perPage),
        },
      });
    } catch (error) {
      console.error("List tickets error:", error);
      res.status(500).json({ success: false, message: "Error fetching tickets" });
    }
  },

  // Drives the red badge on the admin sidebar.
  getOpenCount: async (req, res) => {
    try {
      const count = await SupportTicket.countDocuments({
        status: { $in: ["open", "in_progress", "waiting", "escalated"] },
      });
      res.json({ success: true, data: { count } });
    } catch (error) {
      console.error("Ticket count error:", error);
      res.status(500).json({ success: false, message: "Error fetching count" });
    }
  },

  getStats: async (req, res) => {
    try {
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);

      const [statusBreakdown, responded, resolved, resolvedToday, recent] =
        await Promise.all([
          SupportTicket.aggregate([
            { $group: { _id: "$status", count: { $sum: 1 } } },
          ]),
          SupportTicket.find({ firstResponseAt: { $ne: null } })
            .select("createdAt firstResponseAt assignedTo")
            .lean(),
          SupportTicket.find({ resolvedAt: { $ne: null } })
            .select("createdAt resolvedAt assignedTo")
            .lean(),
          SupportTicket.countDocuments({ resolvedAt: { $gte: startOfToday } }),
          SupportTicket.find({})
            .populate("raisedBy", "firstName lastName")
            .select("ticketNumber title status priority lastActivityAt raisedBy")
            .sort({ lastActivityAt: -1 })
            .limit(10)
            .lean(),
        ]);

      const avgMs = (rows, from, to) => {
        if (!rows.length) return 0;
        const total = rows.reduce(
          (sum, row) => sum + (new Date(row[to]) - new Date(row[from])),
          0
        );
        return Math.round(total / rows.length);
      };

      const byStatus = TICKET_STATUSES.reduce((acc, status) => {
        const found = statusBreakdown.find((s) => s._id === status);
        acc[status] = found ? found.count : 0;
        return acc;
      }, {});

      const mine = String(req.user._id);
      const myResponded = responded.filter(
        (t) => String(t.assignedTo) === mine
      );
      const myResolved = resolved.filter((t) => String(t.assignedTo) === mine);

      res.json({
        success: true,
        data: {
          openTickets:
            byStatus.open + byStatus.in_progress + byStatus.waiting + byStatus.escalated,
          resolvedToday,
          byStatus,
          team: {
            avgResponseMs: avgMs(responded, "createdAt", "firstResponseAt"),
            avgResolutionMs: avgMs(resolved, "createdAt", "resolvedAt"),
            respondedCount: responded.length,
            resolvedCount: resolved.length,
          },
          me: {
            avgResponseMs: avgMs(myResponded, "createdAt", "firstResponseAt"),
            avgResolutionMs: avgMs(myResolved, "createdAt", "resolvedAt"),
            respondedCount: myResponded.length,
            resolvedCount: myResolved.length,
          },
          recentActivity: recent,
        },
      });
    } catch (error) {
      console.error("Ticket stats error:", error);
      res.status(500).json({ success: false, message: "Error fetching stats" });
    }
  },

  exportCsv: async (req, res) => {
    try {
      const { status, type, category, priority } = req.query;
      const query = {};
      if (status && status !== "all" && TICKET_STATUSES.includes(status)) {
        query.status = status;
      }
      if (type && type !== "all" && TICKET_TYPES.includes(type)) query.type = type;
      if (category && category !== "all" && TICKET_CATEGORIES.includes(category)) {
        query.category = category;
      }
      if (priority && priority !== "all" && TICKET_PRIORITIES.includes(priority)) {
        query.priority = priority;
      }

      const tickets = await SupportTicket.find(query)
        .populate("raisedBy", "firstName lastName email")
        .populate("assignedTo", "firstName lastName")
        .sort({ createdAt: -1 })
        .lean();

      const escape = (value) => {
        const str = value === null || value === undefined ? "" : String(value);
        return `"${str.replace(/"/g, '""').replace(/\r?\n/g, " ")}"`;
      };

      const header = [
        "Ticket",
        "Title",
        "Type",
        "Category",
        "Priority",
        "Status",
        "Source",
        "Raised By",
        "Email",
        "Assigned To",
        "Created",
        "Resolved",
      ];

      const rows = tickets.map((t) =>
        [
          t.ticketNumber,
          t.title,
          t.type,
          t.category,
          t.priority,
          t.status,
          t.source,
          t.raisedBy
            ? `${t.raisedBy.firstName || ""} ${t.raisedBy.lastName || ""}`.trim()
            : "",
          t.raisedBy?.email || "",
          t.assignedTo
            ? `${t.assignedTo.firstName || ""} ${t.assignedTo.lastName || ""}`.trim()
            : "",
          t.createdAt ? new Date(t.createdAt).toISOString() : "",
          t.resolvedAt ? new Date(t.resolvedAt).toISOString() : "",
        ]
          .map(escape)
          .join(",")
      );

      const csv = [header.map(escape).join(","), ...rows].join("\n");

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="support-tickets-${Date.now()}.csv"`
      );
      res.send(csv);
    } catch (error) {
      console.error("Ticket CSV export error:", error);
      res.status(500).json({ success: false, message: "Error exporting tickets" });
    }
  },

  assignTicket: async (req, res) => {
    try {
      const { assignedTo } = req.body;

      const update = { lastActivityAt: new Date() };
      if (!assignedTo) {
        update.assignedTo = null;
      } else {
        if (!mongoose.Types.ObjectId.isValid(assignedTo)) {
          return res
            .status(400)
            .json({ success: false, message: "Invalid assignee" });
        }
        update.assignedTo = assignedTo;
      }

      const ticket = await SupportTicket.findByIdAndUpdate(
        req.params.id,
        { $set: update },
        { new: true }
      )
        .populate("assignedTo", "firstName lastName email")
        .populate("raisedBy", "firstName lastName email");

      if (!ticket) {
        return res
          .status(404)
          .json({ success: false, message: "Ticket not found" });
      }

      res.json({ success: true, message: "Ticket assigned", data: ticket });
    } catch (error) {
      console.error("Assign ticket error:", error);
      res.status(500).json({ success: false, message: "Error assigning ticket" });
    }
  },

  updateStatus: async (req, res) => {
    try {
      const { status, priority } = req.body;
      const update = { lastActivityAt: new Date() };

      if (status) {
        if (!TICKET_STATUSES.includes(status)) {
          return res
            .status(400)
            .json({ success: false, message: "Invalid status" });
        }
        update.status = status;
        if (status === "resolved") update.resolvedAt = new Date();
        if (status === "closed") update.closedAt = new Date();
      }

      if (priority) {
        if (!TICKET_PRIORITIES.includes(priority)) {
          return res
            .status(400)
            .json({ success: false, message: "Invalid priority" });
        }
        update.priority = priority;
      }

      const ticket = await SupportTicket.findByIdAndUpdate(
        req.params.id,
        { $set: update },
        { new: true }
      ).populate("raisedBy", "firstName lastName email");

      if (!ticket) {
        return res
          .status(404)
          .json({ success: false, message: "Ticket not found" });
      }

      await notifyByEmail(
        ticket.raisedBy?.email,
        `Your support request ${ticket.ticketNumber} was updated`,
        ticketEmailBody(
          "Your support request was updated",
          ticket,
          `The status of your request is now <strong>${ticket.status}</strong>.`
        )
      );

      res.json({ success: true, message: "Ticket updated", data: ticket });
    } catch (error) {
      console.error("Update ticket status error:", error);
      res.status(500).json({ success: false, message: "Error updating ticket" });
    }
  },

  resolveTicket: async (req, res) => {
    try {
      const { resolutionMessage, close } = req.body;
      const ticket = await SupportTicket.findById(req.params.id).populate(
        "raisedBy",
        "firstName lastName email"
      );

      if (!ticket) {
        return res
          .status(404)
          .json({ success: false, message: "Ticket not found" });
      }

      if (resolutionMessage) {
        ticket.messages.push({
          sender: req.user._id,
          senderRole: req.user.userType,
          body: resolutionMessage,
          isInternal: false,
          createdAt: new Date(),
        });
        ticket.resolutionMessage = resolutionMessage;
        if (!ticket.firstResponseAt) ticket.firstResponseAt = new Date();
      }

      ticket.status = close ? "closed" : "resolved";
      ticket.resolvedAt = ticket.resolvedAt || new Date();
      if (close) ticket.closedAt = new Date();
      ticket.lastActivityAt = new Date();

      await ticket.save();

      await notifyByEmail(
        ticket.raisedBy?.email,
        `Your support request ${ticket.ticketNumber} has been resolved`,
        ticketEmailBody(
          "Your support request has been resolved",
          ticket,
          resolutionMessage || "Your request has been marked as resolved."
        )
      );

      res.json({ success: true, message: "Ticket resolved", data: ticket });
    } catch (error) {
      console.error("Resolve ticket error:", error);
      res.status(500).json({ success: false, message: "Error resolving ticket" });
    }
  },

  // Assignee picker in the admin/support UI.
  getAgents: async (req, res) => {
    try {
      const agents = await User.find({
        userType: { $in: SUPPORT_ROLES },
        isActive: true,
      })
        .select("firstName lastName email userType")
        .sort({ firstName: 1 })
        .lean();

      res.json({ success: true, data: agents });
    } catch (error) {
      console.error("Get agents error:", error);
      res.status(500).json({ success: false, message: "Error fetching agents" });
    }
  },

  // Exposed so the frontend builds its dropdowns from the server's enums
  // instead of keeping a second copy that can drift.
  getMeta: async (req, res) => {
    res.json({
      success: true,
      data: {
        statuses: TICKET_STATUSES,
        priorities: TICKET_PRIORITIES,
        types: TICKET_TYPES,
        categories: TICKET_CATEGORIES,
      },
    });
  },
};

module.exports = supportTicketController;
module.exports.isSupportStaff = isSupportStaff;
module.exports.SUPPORT_ROLES = SUPPORT_ROLES;
