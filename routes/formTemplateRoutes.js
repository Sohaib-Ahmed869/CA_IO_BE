// routes/formTemplateRoutes.js
const express = require("express");
const router = express.Router();
const formTemplateController = require("../controllers/formTemplateController");

// Create a new form template
router.post("/", formTemplateController.createFormTemplate);

// Get all form templates
router.get("/", formTemplateController.getAllFormTemplates);

// Get form template by ID
router.get("/:id", formTemplateController.getFormTemplateById);

// Update form template
router.put("/:id", formTemplateController.updateFormTemplate);

// Delete form template
router.delete("/:id", formTemplateController.deleteFormTemplate);

module.exports = router;
