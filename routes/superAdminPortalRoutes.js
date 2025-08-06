// routes/superAdminPortalRoutes.js
const express = require("express");
const router = express.Router();
const { authenticate, isSuperAdmin } = require("../middleware/auth");
const {
  getPortalDashboardStats,
  getFormTemplatesForPortal,
  getCertificationsForPortal,
  getFormTemplateByIdForPortal,
  getCertificationByIdForPortal,
  getAllFormTemplatesForDropdown,
  debugAllFormTemplates,
} = require("../controllers/superAdminPortalController");

// All routes require super admin authentication
router.use(authenticate);
router.use(isSuperAdmin);

// Dashboard
router.get("/dashboard/stats", getPortalDashboardStats);

// Form Templates
router.get("/form-templates", getFormTemplatesForPortal);
router.get("/form-templates/dropdown", getAllFormTemplatesForDropdown);
router.get("/form-templates/debug", debugAllFormTemplates);
router.get("/form-templates/:id", getFormTemplateByIdForPortal);

// Certifications
router.get("/certifications", getCertificationsForPortal);
router.get("/certifications/:id", getCertificationByIdForPortal);

module.exports = router; 