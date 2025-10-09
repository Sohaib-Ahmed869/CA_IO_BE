// routes/formTemplateRoutes.js
const express = require("express");
const router = express.Router();
const formTemplateController = require("../controllers/formTemplateController");
const { authenticate, authorize, isSuperAdmin } = require("../middleware/auth");
const { validateRTOAccess, allowAdminRTOAccess } = require("../middleware/rtoAccess");

// Public routes (for users to view available templates)
router.get("/", formTemplateController.getAllFormTemplates);
router.get("/:id", authenticate, allowAdminRTOAccess, formTemplateController.getFormTemplateById);

// Protected routes (require authentication)
router.post("/", authenticate, allowAdminRTOAccess, authorize("admin", "super_admin", "certified-admin"), formTemplateController.createFormTemplate);
router.put("/:id", authenticate, allowAdminRTOAccess, authorize("admin", "super_admin", "certified-admin"), formTemplateController.updateFormTemplate);
router.delete("/:id", authenticate, allowAdminRTOAccess, authorize("admin", "super_admin", "certified-admin"), formTemplateController.deleteFormTemplate);

module.exports = router;
