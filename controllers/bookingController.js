const Booking = require("../models/booking");
const Application = require("../models/application");
const User = require("../models/user");
const emailService = require("../services/emailService2");

function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && aEnd > bStart; // [start, end)
}

async function findConflicts({ assessorId, studentId, start, end, excludeId = null }) {
  const query = {
    status: { $in: ["scheduled", "rescheduled"] },
    $or: [
      { assessorId },
      { studentId },
    ],
  };
  if (excludeId) query._id = { $ne: excludeId };

  const candidates = await Booking.find(query)
    .select("scheduledStart scheduledEnd assessorId studentId status")
    .populate("assessorId", "firstName lastName email")
    .populate("studentId", "firstName lastName email");
  return candidates.filter((b) => overlaps(start, end, b.scheduledStart, b.scheduledEnd));
}

const bookingController = {
  // Create booking (admin or assigned assessor)
  create: async (req, res) => {
    try {
      const { applicationId, assessorId: inputAssessorId, start, end, notes } = req.body;
      const user = req.user;

      if (!applicationId || !start || !end) {
        return res.status(400).json({ success: false, message: "applicationId, start, end required" });
      }
      const startDate = new Date(start);
      const endDate = new Date(end);
      if (!(startDate < endDate)) {
        return res.status(400).json({ success: false, message: "Invalid time range" });
      }

      const app = await Application.findById(applicationId).populate("userId", "firstName lastName email").populate("assignedAssessor", "firstName lastName email");
      if (!app) return res.status(404).json({ success: false, message: "Application not found" });

      const assessorId = inputAssessorId || (app.assignedAssessor && app.assignedAssessor._id);
      if (!assessorId) return res.status(400).json({ success: false, message: "Assessor not assigned" });

      // Auth: admin or assigned assessor only
      const isAdmin = user.userType === "admin" || user.userType === "super_admin";
      const isAssignedAssessor = String(assessorId) === String(user._id) && user.userType === "assessor";
      if (!isAdmin && !isAssignedAssessor) return res.status(403).json({ success: false, message: "Not authorized" });

      // Conflict check
      const conflicts = await findConflicts({ assessorId, studentId: app.userId._id, start: startDate, end: endDate });
      if (conflicts.length > 0) return res.status(409).json({ success: false, message: "Conflict: time slot overlaps", conflicts: conflicts.map(c => ({
        bookingId: String(c._id),
        status: c.status,
        scheduledStart: c.scheduledStart,
        scheduledEnd: c.scheduledEnd,
        assessor: c.assessorId ? { id: String(c.assessorId._id), name: `${c.assessorId.firstName} ${c.assessorId.lastName}` } : undefined,
        student: c.studentId ? { id: String(c.studentId._id), name: `${c.studentId.firstName} ${c.studentId.lastName}` } : undefined,
      })) });

      const booking = await Booking.create({
        applicationId: app._id,
        studentId: app.userId._id,
        assessorId,
        status: "scheduled",
        scheduledStart: startDate,
        scheduledEnd: endDate,
        notes: notes || "",
        createdBy: user._id,
        updatedBy: user._id,
        audit: [{ action: "created", by: user._id, at: new Date(), meta: { start: startDate, end: endDate } }],
      });

      // Emails
      try {
        await emailService.sendBookingScheduledEmail(app.userId.email, app.userId, booking, app);
        const assessor = app.assignedAssessor || (await User.findById(assessorId).select("email firstName lastName"));
        if (assessor?.email) await emailService.sendBookingScheduledEmail(assessor.email, assessor, booking, app, { isAssessor: true });
      } catch (_) {}

      res.json({ success: true, data: booking });
    } catch (error) {
      console.error("Create booking error:", error);
      res.status(500).json({ success: false, message: "Error creating booking" });
    }
  },

  // List bookings
  list: async (req, res) => {
    try {
      const { studentId, assessorId, applicationId, status, q, from, to } = req.query;
      const query = {};
      if (studentId) query.studentId = studentId;
      if (assessorId) query.assessorId = assessorId;
      if (applicationId) query.applicationId = applicationId;
      if (status) query.status = status;
      if (from || to) {
        query.scheduledStart = {};
        if (from) query.scheduledStart.$gte = new Date(from);
        if (to) query.scheduledStart.$lte = new Date(to);
      }

      // Free-text search: student name/email or applicationId if ObjectId-ish
      if (q && String(q).trim()) {
        const search = String(q).trim();
        const looksLikeId = /^[a-f\d]{24}$/i.test(search);
        const orFilters = [];
        // Find matching students
        const users = await User.find({
          $or: [
            { firstName: { $regex: search, $options: 'i' } },
            { lastName: { $regex: search, $options: 'i' } },
            { email: { $regex: search, $options: 'i' } },
          ],
        }).select('_id');
        const studentIds = users.map(u => u._id);
        if (studentIds.length) orFilters.push({ studentId: { $in: studentIds } });
        if (looksLikeId) orFilters.push({ applicationId: search });
        if (orFilters.length) {
          query.$or = orFilters;
        } else {
          return res.json({ success: true, data: [] });
        }
      }

      const bookings = await Booking.find(query)
        .populate("applicationId", "certificationId userId")
        .populate("studentId", "firstName lastName email")
        .populate("assessorId", "firstName lastName email")
        .sort({ scheduledStart: 1 });
      res.json({ success: true, data: bookings });
    } catch (error) {
      console.error("List bookings error:", error);
      res.status(500).json({ success: false, message: "Error fetching bookings" });
    }
  },

  // Check availability (returns conflicting bookings)
  availability: async (req, res) => {
    try {
      const { assessorId, studentId, start, end, excludeId } = req.query;
      if (!assessorId && !studentId) return res.status(400).json({ success: false, message: "assessorId or studentId required" });
      const s = new Date(start);
      const e = new Date(end);
      if (!(s < e)) return res.status(400).json({ success: false, message: "Invalid time range" });
      const conflicts = await findConflicts({ assessorId, studentId, start: s, end: e, excludeId });
      return res.json({ success: true, data: conflicts.map(c => ({
        bookingId: String(c._id),
        status: c.status,
        scheduledStart: c.scheduledStart,
        scheduledEnd: c.scheduledEnd,
        assessor: c.assessorId ? { id: String(c.assessorId._id), name: `${c.assessorId.firstName} ${c.assessorId.lastName}` } : undefined,
        student: c.studentId ? { id: String(c.studentId._id), name: `${c.studentId.firstName} ${c.studentId.lastName}` } : undefined,
      })) });
    } catch (error) {
      console.error("Availability check error:", error);
      res.status(500).json({ success: false, message: "Error checking availability" });
    }
  },

  // Student requests reschedule
  requestReschedule: async (req, res) => {
    try {
      const { bookingId } = req.params;
      const { requestedStart, requestedEnd, reason } = req.body;
      const user = req.user;

      const booking = await Booking.findById(bookingId).populate("applicationId", "userId assignedAssessor").populate("studentId").populate("assessorId");
      if (!booking) return res.status(404).json({ success: false, message: "Booking not found" });

      // Only the student can request a reschedule
      if (String(booking.studentId._id) !== String(user.id)) {
        return res.status(403).json({ success: false, message: "Only the student can request a reschedule" });
      }

      // Validate current status
      if (booking.status === "reschedule_requested") {
        return res.status(409).json({ success: false, message: "A reschedule request is already pending" });
      }
      if (booking.status === "cancelled") {
        return res.status(400).json({ success: false, message: "Cannot reschedule a cancelled booking" });
      }
      if (booking.status === "completed") {
        return res.status(400).json({ success: false, message: "Cannot reschedule a completed booking" });
      }

      const rs = new Date(requestedStart);
      const re = new Date(requestedEnd);
      if (!(rs < re)) return res.status(400).json({ success: false, message: "Invalid time range" });

      const conflicts = await findConflicts({ assessorId: booking.assessorId._id, studentId: booking.studentId._id, start: rs, end: re, excludeId: booking._id });
      if (conflicts.length > 0) return res.status(409).json({ success: false, message: "Conflict: time slot overlaps", conflicts: conflicts.map(c => ({
        bookingId: String(c._id),
        status: c.status,
        scheduledStart: c.scheduledStart,
        scheduledEnd: c.scheduledEnd,
        assessor: c.assessorId ? { id: String(c.assessorId._id), name: `${c.assessorId.firstName} ${c.assessorId.lastName}` } : undefined,
        student: c.studentId ? { id: String(c.studentId._id), name: `${c.studentId.firstName} ${c.studentId.lastName}` } : undefined,
      })) });

      booking.requestedStart = rs;
      booking.requestedEnd = re;
      booking.status = "reschedule_requested";
      booking.updatedBy = user.id;
      booking.audit.push({ action: "reschedule_requested", by: user.id, at: new Date(), meta: { reason, requestedStart: rs, requestedEnd: re } });
      await booking.save();

      try {
        await emailService.sendBookingRescheduleRequestedEmail(booking.assessorId.email, booking, { actor: "student" });
        await emailService.sendBookingRescheduleRequestedEmail(booking.studentId.email, booking, { actor: "student_copy" });
      } catch (_) {}

      res.json({ success: true, data: booking });
    } catch (error) {
      console.error("Request reschedule error:", error);
      res.status(500).json({ success: false, message: "Error requesting reschedule" });
    }
  },

  // Assessor/Admin approve reschedule
  approveReschedule: async (req, res) => {
    try {
      const { bookingId } = req.params;
      const user = req.user;

      const booking = await Booking.findById(bookingId).populate("applicationId", "assignedAssessor userId").populate("studentId").populate("assessorId");
      if (!booking) return res.status(404).json({ success: false, message: "Booking not found" });
      const isAdmin = user.userType === "admin" || user.userType === "super_admin";
      const isAssessor = user.userType === "assessor" && String(booking.assessorId._id) === String(user._id);
      if (!isAdmin && !isAssessor) return res.status(403).json({ success: false, message: "Not authorized" });
      if (booking.status !== "reschedule_requested") return res.status(400).json({ success: false, message: "No reschedule requested" });

      const ns = booking.requestedStart;
      const ne = booking.requestedEnd;
      const conflicts = await findConflicts({ assessorId: booking.assessorId._id, studentId: booking.studentId._id, start: ns, end: ne, excludeId: booking._id });
      if (conflicts.length > 0) return res.status(409).json({ success: false, message: "Conflict: time slot overlaps", conflicts: conflicts.map(c => ({
        bookingId: String(c._id),
        status: c.status,
        scheduledStart: c.scheduledStart,
        scheduledEnd: c.scheduledEnd,
        assessor: c.assessorId ? { id: String(c.assessorId._id), name: `${c.assessorId.firstName} ${c.assessorId.lastName}` } : undefined,
        student: c.studentId ? { id: String(c.studentId._id), name: `${c.studentId.firstName} ${c.studentId.lastName}` } : undefined,
      })) });

      booking.scheduledStart = ns;
      booking.scheduledEnd = ne;
      booking.requestedStart = undefined;
      booking.requestedEnd = undefined;
      booking.status = "rescheduled";
      booking.updatedBy = user._id;
      booking.audit.push({ action: "reschedule_approved", by: user._id, at: new Date(), meta: { newStart: ns, newEnd: ne } });
      await booking.save();

      try {
        await emailService.sendBookingRescheduleApprovedEmail(booking.studentId.email, booking);
        await emailService.sendBookingRescheduleApprovedEmail(booking.assessorId.email, booking, { isAssessor: true });
      } catch (_) {}

      res.json({ success: true, data: booking });
    } catch (error) {
      console.error("Approve reschedule error:", error);
      res.status(500).json({ success: false, message: "Error approving reschedule" });
    }
  },

  // Assessor/Admin reject reschedule
  rejectReschedule: async (req, res) => {
    try {
      const { bookingId } = req.params;
      const { reason } = req.body;
      const user = req.user;

      const booking = await Booking.findById(bookingId).populate("studentId").populate("assessorId");
      if (!booking) return res.status(404).json({ success: false, message: "Booking not found" });
      const isAdmin = user.userType === "admin" || user.userType === "super_admin";
      const isAssessor = user.userType === "assessor" && String(booking.assessorId._id) === String(user._id);
      if (!isAdmin && !isAssessor) return res.status(403).json({ success: false, message: "Not authorized" });
      if (booking.status !== "reschedule_requested") return res.status(400).json({ success: false, message: "No reschedule requested" });

      booking.status = "scheduled";
      booking.requestedStart = undefined;
      booking.requestedEnd = undefined;
      booking.updatedBy = user._id;
      booking.audit.push({ action: "reschedule_rejected", by: user._id, at: new Date(), meta: { reason } });
      await booking.save();

      try {
        await emailService.sendBookingRescheduleRejectedEmail(booking.studentId.email, booking, { reason });
        await emailService.sendBookingRescheduleRejectedEmail(booking.assessorId.email, booking, { reason, isAssessor: true });
      } catch (_) {}

      res.json({ success: true, data: booking });
    } catch (error) {
      console.error("Reject reschedule error:", error);
      res.status(500).json({ success: false, message: "Error rejecting reschedule" });
    }
  },

  // Cancel booking
  cancel: async (req, res) => {
    try {
      const { bookingId } = req.params;
      const user = req.user;

      const booking = await Booking.findById(bookingId).populate("studentId").populate("assessorId");
      if (!booking) return res.status(404).json({ success: false, message: "Booking not found" });

      const isAdmin = user.userType === "admin" || user.userType === "super_admin";
      const isAssessor = user.userType === "assessor" && String(booking.assessorId._id) === String(user._id);
      const isStudent = user.userType === "user" && String(booking.studentId._id) === String(user._id);
      if (!isAdmin && !isAssessor && !isStudent) return res.status(403).json({ success: false, message: "Not authorized" });

      booking.status = "cancelled";
      booking.updatedBy = user._id;
      booking.audit.push({ action: "cancelled", by: user._id, at: new Date() });
      await booking.save();

      try {
        await emailService.sendBookingCancelledEmail(booking.studentId.email, booking);
        await emailService.sendBookingCancelledEmail(booking.assessorId.email, booking, { isAssessor: true });
      } catch (_) {}

      res.json({ success: true, data: booking });
    } catch (error) {
      console.error("Cancel booking error:", error);
      res.status(500).json({ success: false, message: "Error cancelling booking" });
    }
  },
};

module.exports = bookingController;
