const express = require("express");
const router = express.Router();
const { authenticate } = require("../middleware/auth");
const bookingController = require("../controllers/bookingController");

router.use(authenticate);

router.post("/", bookingController.create);
router.get("/", bookingController.list);
router.get("/availability", bookingController.availability);
router.post("/:bookingId/reschedule-request", bookingController.requestReschedule);
router.post("/:bookingId/reschedule-approve", bookingController.approveReschedule);
router.post("/:bookingId/reschedule-reject", bookingController.rejectReschedule);
router.delete("/:bookingId", bookingController.cancel);

module.exports = router;
