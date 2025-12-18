const express = require("express");
const router = express.Router();
const modalAnswersController = require("../controllers/modalAnswersController");
const { authenticate, authorize } = require("../middleware/auth");

// Public: get modal answers for a certification
router.get("/:certId", authenticate, modalAnswersController.getByCertification);
// List
router.get("/", authenticate, authorize("admin", "super_admin"), modalAnswersController.list);
// Create or replace (admin/super_admin)
router.post("/", authenticate, authorize("admin", "super_admin"), modalAnswersController.createOrReplace);
// Deactivate
router.delete("/:id", authenticate, authorize("admin", "super_admin"), modalAnswersController.deactivate);

module.exports = router;
