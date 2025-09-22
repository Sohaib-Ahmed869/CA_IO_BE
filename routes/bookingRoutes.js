const express = require("express");
const router = express.Router();
const { authenticate, authorize } = require("../middleware/auth");
const bookingController = require("../controllers/bookingController");

// Create booking (admin/assessor)
router.post("/", authenticate, authorize("admin", "assessor"), bookingController.create);

// Mark booking as completed (admin/assessor)
router.post("/:bookingId/complete", authenticate, authorize("admin", "assessor"), bookingController.markCompleted);

// List bookings (admin/assessor; students can view their own via controller scoping)
router.get("/", authenticate, authorize("admin", "assessor", "user"), bookingController.list);

// Availability
router.get("/availability", authenticate, authorize("admin", "assessor"), bookingController.getAvailability);

// Check availability (returns conflicting bookings)
router.get("/check-availability", authenticate, authorize("admin", "assessor"), bookingController.availability);

// Reschedule request (student)
router.post("/:bookingId/reschedule-request", authenticate, bookingController.requestReschedule);

// Approve/Reject reschedule (admin/assessor)
router.post("/:bookingId/approve", authenticate, authorize("admin", "assessor"), bookingController.approveReschedule);
router.post("/:bookingId/reject", authenticate, authorize("admin", "assessor"), bookingController.rejectReschedule);

// Backward-compatible aliases
router.post("/:bookingId/reschedule-approve", authenticate, authorize("admin", "assessor"), bookingController.approveReschedule);
router.post("/:bookingId/reschedule-reject", authenticate, authorize("admin", "assessor"), bookingController.rejectReschedule);

// Cancel (any party)
router.post("/:bookingId/cancel", authenticate, bookingController.cancel);

module.exports = router;


