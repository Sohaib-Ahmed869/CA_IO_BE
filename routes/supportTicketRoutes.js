// routes/supportTicketRoutes.js
const express = require("express");
const router = express.Router();
const { authenticate, authorize } = require("../middleware/auth");
const { upload } = require("../config/s3Config");
const supportTicketController = require("../controllers/supportTicketController");

// Every support route requires a signed-in user; `authorize` additionally gates
// the queue-wide operations to support staff (super_admin always passes).
router.use(authenticate);

const staffOnly = authorize("admin", "support");

// --- Anyone signed in (student, assessor, staff) --------------------------
router.get("/meta", supportTicketController.getMeta);
router.get("/my", supportTicketController.getMyTickets);
router.post(
  "/",
  upload.array("attachments", 10),
  supportTicketController.createTicket
);

// --- Support staff --------------------------------------------------------
// Declared before "/:id" so these literal paths are not swallowed by the
// parameterised route.
router.get("/", staffOnly, supportTicketController.listTickets);
router.get("/stats", staffOnly, supportTicketController.getStats);
router.get("/open-count", staffOnly, supportTicketController.getOpenCount);
router.get("/agents", staffOnly, supportTicketController.getAgents);
router.get("/export", staffOnly, supportTicketController.exportCsv);

// --- Single ticket --------------------------------------------------------
router.get("/:id", supportTicketController.getTicketById);
router.post(
  "/:id/messages",
  upload.array("attachments", 10),
  supportTicketController.addMessage
);
router.patch("/:id/assign", staffOnly, supportTicketController.assignTicket);
router.patch("/:id/status", staffOnly, supportTicketController.updateStatus);
router.post("/:id/resolve", staffOnly, supportTicketController.resolveTicket);

module.exports = router;
