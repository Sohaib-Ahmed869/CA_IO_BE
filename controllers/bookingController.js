// controllers/bookingController.js
const Booking = require("../models/booking");
const Application = require("../models/application");

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
      const { scheduledStart, scheduledEnd, assessorId, notes } = req.body;
      const userId = req.user.id;

      const app = await Application.findById(applicationId).select("userId");
      if (!app) return res.status(404).json({ success: false, message: "Application not found" });

      const start = new Date(scheduledStart);
      const end = new Date(scheduledEnd);
      if (!(start < end)) return res.status(400).json({ success: false, message: "Invalid times" });

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
      return res.status(500).json({ success: false, message: "Error creating booking" });
    }
  },

  list: async (req, res) => {
    try {
      const { applicationId, assessorId, studentId, status } = req.query;
      const filter = {};
      if (applicationId) filter.applicationId = applicationId;
      if (assessorId) filter.assessorId = assessorId;
      if (studentId) filter.studentId = studentId;
      if (status) filter.status = status;
      const items = await Booking.find(filter).sort({ scheduledStart: -1 });
      return res.json({ success: true, data: items });
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


