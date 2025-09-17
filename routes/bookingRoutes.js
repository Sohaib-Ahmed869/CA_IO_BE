const express = require("express");
const router = express.Router();
const { authenticate, authorize } = require("../middleware/auth");
const bookingController = require("../controllers/bookingController");

// Create booking (admin/assessor)
router.post("/", authenticate, authorize(["admin", "assessor"]), bookingController.create);

// List bookings
router.get("/", authenticate, authorize(["admin", "assessor"]), bookingController.list);

// Availability
router.get("/availability", authenticate, authorize(["admin", "assessor"]), bookingController.getAvailability);

// Reschedule request (student)
router.post("/:id/reschedule-request", authenticate, bookingController.requestReschedule);

// Approve/Reject reschedule (admin/assessor)
router.post("/:id/approve", authenticate, authorize(["admin", "assessor"]), bookingController.approveReschedule);
router.post("/:id/reject", authenticate, authorize(["admin", "assessor"]), bookingController.rejectReschedule);

// Cancel (any party)
router.post("/:id/cancel", authenticate, bookingController.cancel);

module.exports = router;


