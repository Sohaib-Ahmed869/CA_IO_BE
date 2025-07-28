// routes/formTemplateRoutes.js
const express = require("express");
const router = express.Router();
const formTemplateController = require("../controllers/formTemplateController");
const { authenticate, authorize, isSuperAdmin } = require("../middleware/auth");

// Public routes (for users to view available templates)
router.get("/", formTemplateController.getAllFormTemplates);
router.get("/:id", formTemplateController.getFormTemplateById);

// Protected routes (require authentication)
router.post("/", authenticate, authorize("admin", "super_admin"), formTemplateController.createFormTemplate);
router.put("/:id", authenticate, authorize("admin", "super_admin"), formTemplateController.updateFormTemplate);
router.delete("/:id", authenticate, authorize("admin", "super_admin"), formTemplateController.deleteFormTemplate);

module.exports = router;
