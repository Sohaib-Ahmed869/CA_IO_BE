// controllers/bookingController.js
const Booking = require("../models/booking");
const Application = require("../models/application");
const User = require("../models/user");

function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

async function findConflicts({ assessorId, studentId, start, end, excludeId }) {
  const query = {
    status: { $ne: "cancelled" },
    $or: [
      { assessorId },
      { studentId },
    ],
    $or: [
      { scheduledStart: { $lt: end }, scheduledEnd: { $gt: start } },
      { requestedStart: { $lt: end }, requestedEnd: { $gt: start } },
    ],
  };
  if (excludeId) query._id = { $ne: excludeId };
  return Booking.find(query);
}

const bookingController = {
  create: async (req, res) => {
    try {
      const { applicationId } = req.body;
      let { assessorId } = req.body;
      const notes = req.body.notes;
      // Accept multiple aliases for start/end to be backward compatible
      const scheduledStartRaw = req.body.scheduledStart || req.body.start || req.body.scheduled_from || req.body.from;
      const scheduledEndRaw = req.body.scheduledEnd || req.body.end || req.body.scheduled_to || req.body.to;
      const userId = req.user.id;

      const app = await Application.findById(applicationId).select("userId assignedAssessor");
      if (!app) return res.status(404).json({ success: false, message: "Application not found" });

      const start = new Date(scheduledStartRaw);
      const end = new Date(scheduledEndRaw);
      if (!scheduledStartRaw || !scheduledEndRaw || isNaN(start.getTime()) || isNaN(end.getTime()) || !(start < end)) {
        return res.status(400).json({ success: false, message: "Invalid times", details: { scheduledStart: scheduledStartRaw, scheduledEnd: scheduledEndRaw } });
      }

      // Resolve assessorId
      if (!assessorId) {
        if (req.user.userType === "assessor") {
          assessorId = req.user._id;
        } else if (app.assignedAssessor) {
          assessorId = app.assignedAssessor;
        }
      }
      if (!assessorId) {
        return res.status(400).json({ success: false, message: "Assessor not assigned. Please assign an assessor to the application before creating a booking." });
      }

      const conflicts = await findConflicts({ assessorId, studentId: app.userId, start, end });
      if (conflicts.length) {
        return res.status(409).json({ success: false, message: "Schedule conflict", conflicts });
      }

      const booking = await Booking.create({
        applicationId,
        studentId: app.userId,
        assessorId,
        status: "scheduled",
        scheduledStart: start,
        scheduledEnd: end,
        notes: notes || "",
        createdBy: userId,
        audit: [{ action: "create", by: userId, details: { scheduledStart: start, scheduledEnd: end } }],
      });

      return res.json({ success: true, data: booking });
    } catch (e) {
      console.error("Booking create error:", e);
      if (e && e.name === 'ValidationError') {
        return res.status(400).json({ success: false, message: e.message });
      }
      return res.status(500).json({ success: false, message: e?.message || "Error creating booking" });
    }
  },

  list: async (req, res) => {
    try {
      const { applicationId, assessorId, studentId, status, q, from, to } = req.query;
      const filter = {};
      if (applicationId) filter.applicationId = applicationId;
      if (assessorId) filter.assessorId = assessorId;
      if (studentId) filter.studentId = studentId;
      if (status) filter.status = status;
      // Students can only see their own bookings
      if (req.user.userType === "user") {
        filter.studentId = req.user._id;
      }

      // Date range filter (overlap with scheduled times)
      const andClauses = [];
      if (from || to) {
        const startBound = from ? new Date(from) : null;
        const endBound = to ? new Date(to) : null;
        if ((startBound && isNaN(startBound.getTime())) || (endBound && isNaN(endBound.getTime()))) {
          return res.status(400).json({ success: false, message: "Invalid date range" });
        }
        // Overlap condition: scheduledStart < to AND scheduledEnd > from
        const overlap = {};
        if (endBound) overlap.scheduledStart = { $lt: endBound };
        if (startBound) overlap.scheduledEnd = { ...(overlap.scheduledEnd || {}), $gt: startBound };
        andClauses.push(overlap);
      }

      // Free-text search q (student name/email or application id)
      if (q && String(q).trim()) {
        const queryText = String(q).trim();
        const possibleObjectId = /^[a-f\d]{24}$/i.test(queryText);
        const orUser = [
          { firstName: { $regex: queryText, $options: "i" } },
          { lastName: { $regex: queryText, $options: "i" } },
          { email: { $regex: queryText, $options: "i" } },
        ];
        const users = await User.find({ $or: orUser }).select("_id");
        const studentIds = users.map(u => u._id);
        const orClauses = [];
        if (studentIds.length) orClauses.push({ studentId: { $in: studentIds } });
        if (possibleObjectId) orClauses.push({ applicationId: queryText });
        if (orClauses.length) {
          andClauses.push({ $or: orClauses });
        } else {
          // If q provided but no match candidates, force empty result
          return res.json({ success: true, data: [] });
        }
      }

      const finalFilter = andClauses.length ? { $and: [filter, ...andClauses] } : filter;
      const items = await Booking.find(finalFilter)
        .sort({ scheduledStart: -1 })
        .populate("studentId", "firstName lastName email")
        .populate("assessorId", "firstName lastName email")
        .populate({
          path: "applicationId",
          select: "certificationId",
          populate: { path: "certificationId", select: "name" },
        })
        .lean();

      const data = items.map((b) => {
        const student = b.studentId
          ? {
              _id: b.studentId._id,
              firstName: b.studentId.firstName,
              lastName: b.studentId.lastName,
              email: b.studentId.email,
            }
          : null;
        const assessor = b.assessorId
          ? {
              _id: b.assessorId._id,
              firstName: b.assessorId.firstName,
              lastName: b.assessorId.lastName,
              email: b.assessorId.email,
            }
          : null;
        const application = b.applicationId
          ? {
              _id: b.applicationId._id,
              qualificationName:
                (b.applicationId.certificationId &&
                  b.applicationId.certificationId.name) || null,
            }
          : null;

        return {
          ...b,
          student,
          assessor,
          application,
          studentName: student
            ? `${student.firstName || ""} ${student.lastName || ""}`.trim()
            : undefined,
          assessorName: assessor
            ? `${assessor.firstName || ""} ${assessor.lastName || ""}`.trim()
            : undefined,
        };
      });

      return res.json({ success: true, data });
    } catch (e) {
      console.error("Booking list error:", e);
      return res.status(500).json({ success: false, message: "Error listing bookings" });
    }
  },

  requestReschedule: async (req, res) => {
    try {
      const { id } = req.params;
      const { requestedStart, requestedEnd } = req.body;
      const userId = req.user.id;
      const booking = await Booking.findById(id);
      if (!booking) return res.status(404).json({ success: false, message: "Booking not found" });
      // Only the student who owns the booking, or admin/assessor, can request reschedule
      if (
        req.user.userType === "user" && String(booking.studentId) !== String(req.user._id)
      ) {
        return res.status(403).json({ success: false, message: "Not authorized to reschedule this booking" });
      }
      const start = new Date(requestedStart);
      const end = new Date(requestedEnd);
      if (!(start < end)) return res.status(400).json({ success: false, message: "Invalid times" });
      const conflicts = await findConflicts({ assessorId: booking.assessorId, studentId: booking.studentId, start, end, excludeId: booking._id });
      if (conflicts.length) return res.status(409).json({ success: false, message: "Schedule conflict", conflicts });
      booking.requestedStart = start;
      booking.requestedEnd = end;
      booking.status = "reschedule_requested";
      booking.audit.push({ action: "request_reschedule", by: userId, details: { requestedStart: start, requestedEnd: end } });
      await booking.save();
      return res.json({ success: true, data: booking });
    } catch (e) {
      console.error("Booking reschedule request error:", e);
      return res.status(500).json({ success: false, message: "Error requesting reschedule" });
    }
  },

  approveReschedule: async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      const booking = await Booking.findById(id);
      if (!booking) return res.status(404).json({ success: false, message: "Booking not found" });
      if (!booking.requestedStart || !booking.requestedEnd) return res.status(400).json({ success: false, message: "No reschedule requested" });
      const conflicts = await findConflicts({ assessorId: booking.assessorId, studentId: booking.studentId, start: booking.requestedStart, end: booking.requestedEnd, excludeId: booking._id });
      if (conflicts.length) return res.status(409).json({ success: false, message: "Schedule conflict", conflicts });
      booking.scheduledStart = booking.requestedStart;
      booking.scheduledEnd = booking.requestedEnd;
      booking.requestedStart = undefined;
      booking.requestedEnd = undefined;
      booking.status = "rescheduled";
      booking.audit.push({ action: "approve_reschedule", by: userId });
      await booking.save();
      return res.json({ success: true, data: booking });
    } catch (e) {
      console.error("Booking approve reschedule error:", e);
      return res.status(500).json({ success: false, message: "Error approving reschedule" });
    }
  },

  rejectReschedule: async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      const booking = await Booking.findById(id);
      if (!booking) return res.status(404).json({ success: false, message: "Booking not found" });
      booking.requestedStart = undefined;
      booking.requestedEnd = undefined;
      booking.audit.push({ action: "reject_reschedule", by: userId });
      await booking.save();
      return res.json({ success: true, data: booking });
    } catch (e) {
      console.error("Booking reject reschedule error:", e);
      return res.status(500).json({ success: false, message: "Error rejecting reschedule" });
    }
  },

  cancel: async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      const booking = await Booking.findById(id);
      if (!booking) return res.status(404).json({ success: false, message: "Booking not found" });
      booking.status = "cancelled";
      booking.audit.push({ action: "cancel", by: userId });
      await booking.save();
      return res.json({ success: true, data: booking });
    } catch (e) {
      console.error("Booking cancel error:", e);
      return res.status(500).json({ success: false, message: "Error cancelling booking" });
    }
  },

  getAvailability: async (req, res) => {
    try {
      const { assessorId, date } = req.query;
      if (!assessorId) return res.status(400).json({ success: false, message: "assessorId is required" });
      const day = new Date(date || Date.now());
      const startOfDay = new Date(day.getFullYear(), day.getMonth(), day.getDate());
      const endOfDay = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1);
      const bookings = await Booking.find({ assessorId, status: { $ne: "cancelled" }, scheduledStart: { $lt: endOfDay }, scheduledEnd: { $gt: startOfDay } }).sort({ scheduledStart: 1 });
      return res.json({ success: true, data: bookings });
    } catch (e) {
      console.error("Booking availability error:", e);
      return res.status(500).json({ success: false, message: "Error fetching availability" });
    }
  },
};

module.exports = bookingController;


