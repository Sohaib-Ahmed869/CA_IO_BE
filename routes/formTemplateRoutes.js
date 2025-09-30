// routes/formTemplateRoutes.js
const express = require("express");
const router = express.Router();
const formTemplateController = require("../controllers/formTemplateController");
const { authenticate, authorize, isSuperAdmin } = require("../middleware/auth");
const { optionalRtoContext } = require("../middleware/rtoContext");

// Public routes (for users to view available templates)
router.get("/", optionalRtoContext, formTemplateController.getAllFormTemplates);
router.get("/:id", optionalRtoContext, formTemplateController.getFormTemplateById);

// Protected routes (require authentication)
router.post("/", authenticate, authorize("admin", "super_admin", "certified-admin"), optionalRtoContext, formTemplateController.createFormTemplate);
router.put("/:id", authenticate, authorize("admin", "super_admin", "certified-admin"), optionalRtoContext, formTemplateController.updateFormTemplate);
router.delete("/:id", authenticate, authorize("admin", "super_admin", "certified-admin"), optionalRtoContext, formTemplateController.deleteFormTemplate);

module.exports = router;
