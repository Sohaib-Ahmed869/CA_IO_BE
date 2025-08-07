// routes/formTemplateRoutes.js
const express = require("express");
const router = express.Router();
const formTemplateController = require("../controllers/formTemplateController");
const { authenticate, authorize, isSuperAdmin } = require("../middleware/auth");
const { identifyRTO } = require("../middleware/tenant");

// Apply RTO identification to all routes
router.use(identifyRTO);

// Public routes (for users to view available form templates)
router.get("/", formTemplateController.getAllFormTemplates);
router.get("/:id", formTemplateController.getFormTemplateById);

// Admin routes (for managing form templates)
router.post("/", authenticate, authorize("admin", "super_admin"), formTemplateController.createFormTemplate);
router.put("/:id", authenticate, authorize("admin", "super_admin"), formTemplateController.updateFormTemplate);
router.delete("/:id", authenticate, authorize("admin", "super_admin"), formTemplateController.deleteFormTemplate);
router.patch("/:id/restore", authenticate, authorize("admin", "super_admin"), formTemplateController.restoreFormTemplate);

module.exports = router;
