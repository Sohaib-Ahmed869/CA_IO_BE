const express = require("express");
const router = express.Router();
const modalAnswersController = require("../controllers/modalAnswersController");
const { authenticate, authorize } = require("../middleware/auth");

router.get("/:certId", authenticate, modalAnswersController.getByCertification);
router.get("/", authenticate, authorize("admin", "super_admin"), modalAnswersController.list);
router.post("/", authenticate, authorize("admin", "super_admin"), modalAnswersController.createOrReplace);
router.delete("/:id", authenticate, authorize("admin", "super_admin"), modalAnswersController.deactivate);

module.exports = router;
