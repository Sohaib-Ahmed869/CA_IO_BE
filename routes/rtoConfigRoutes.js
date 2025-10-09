/**
 * RTO Configuration Routes
 * 
 * Routes for RTO-specific configuration endpoints
 */

const express = require("express");
const router = express.Router();
const rtoConfigController = require("../controllers/rtoConfigController");
const { subdomainRtoContext } = require("../middleware/subdomainRtoContext");
const { authenticate, authorize } = require("../middleware/auth");
const { validateRTOAccess, allowAdminRTOAccess } = require("../middleware/rtoAccess");
const { allowRTODataAccess } = require("../middleware/rtoDataAccess");

// All routes use subdomain RTO context middleware
router.use(subdomainRtoContext);

// Public routes (no auth required) - for frontend initialization
router.get("/config", rtoConfigController.getRtoConfig);
router.get("/branding", rtoConfigController.getRtoBranding);
router.get("/forms", rtoConfigController.getRtoForms);
router.get("/certifications", rtoConfigController.getRtoCertifications);

// Admin routes (auth required)
router.get("/admin/rtos", authenticate, allowAdminRTOAccess, authorize("super_admin", "certified-admin"), rtoConfigController.getAllRTOs);

module.exports = router;
