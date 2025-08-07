// routes/rtoRoutes.js
const express = require("express");
const router = express.Router();
const rtoController = require("../controllers/rtoController");
const { authenticate, isSuperAdmin, authorize } = require("../middleware/auth");
const multer = require("multer");
const { upload } = require("../config/s3Config");

// Public route to get RTO by subdomain
router.get("/subdomain/:subdomain", rtoController.getRTOBySubdomain);
// Public route to get RTO logo by subdomain
router.get("/subdomain/:subdomain/logo", rtoController.getRTOLogoBySubdomain);

// Debug endpoint to test RTO branding
router.get("/:rtoId/debug-branding", rtoController.debugRTOBranding);

// Test email endpoint to debug email sending
router.post("/:rtoId/test-email", rtoController.testEmailWithBranding);

// Asset viewing routes - accessible to all authenticated users
router.get("/:rtoId/logo", rtoController.getRTOLogo);
router.get("/:rtoId/documents", authenticate, rtoController.getRTODocuments);
router.get("/:rtoId/assets", authenticate, rtoController.getAssets);

// RTO-specific data routes - accessible to admin and super admin
router.get("/:rtoId/form-templates", authenticate, authorize("admin", "super_admin"), rtoController.getRTOFormTemplates);
router.get("/:rtoId/certificates", authenticate, authorize("admin", "super_admin"), rtoController.getRTOCertificates);
router.get("/:rtoId/certifications", authenticate, authorize("admin", "super_admin"), rtoController.getRTOCertifications);

// RTO CRUD routes (Super Admin only)
router.post("/", authenticate, isSuperAdmin, rtoController.createRTO);
router.get("/", authenticate, isSuperAdmin, rtoController.getAllRTOs);
router.get("/with-stats", authenticate, isSuperAdmin, rtoController.getAllRTOsWithStats);
router.get("/:id", authenticate, isSuperAdmin, rtoController.getRTOById);
router.put("/:id", authenticate, isSuperAdmin, rtoController.updateRTO);
router.delete("/:id", authenticate, isSuperAdmin, rtoController.deleteRTO);
router.patch("/:id/restore", authenticate, isSuperAdmin, rtoController.restoreRTO);

// Email templates and features (Super Admin only)
router.put("/:id/email-templates", authenticate, isSuperAdmin, rtoController.updateEmailTemplates);
router.put("/:id/features", authenticate, isSuperAdmin, rtoController.updateFeatures);

// Asset Management routes (Super Admin only)
router.post("/:rtoId/logo", authenticate, isSuperAdmin, upload.single("logo"), rtoController.uploadLogo);
router.post("/:rtoId/documents", authenticate, isSuperAdmin, upload.single("document"), rtoController.uploadDocument);
router.put("/:rtoId/documents/:documentId", authenticate, isSuperAdmin, rtoController.updateDocumentStatus);
router.delete("/:rtoId/documents/:documentId", authenticate, isSuperAdmin, rtoController.deleteDocument);
router.delete("/:rtoId/logo", authenticate, isSuperAdmin, rtoController.deleteLogo);

// RTO User Management routes (Super Admin only)
router.post("/:rtoId/users", authenticate, isSuperAdmin, rtoController.createRTOUser);
router.get("/:rtoId/users", authenticate, isSuperAdmin, rtoController.getRTOUsers);
router.get("/:rtoId/users/:userId", authenticate, isSuperAdmin, rtoController.getRTOUserById);
router.put("/:rtoId/users/:userId", authenticate, isSuperAdmin, rtoController.updateRTOUser);
router.delete("/:rtoId/users/:userId", authenticate, isSuperAdmin, rtoController.deleteRTOUser);

// Email template management routes
router.get("/:rtoId/email-templates", authenticate, isSuperAdmin, rtoController.getEmailTemplates);
router.put("/:rtoId/email-templates", authenticate, isSuperAdmin, rtoController.updateEmailTemplate);
router.post("/:rtoId/email-templates/test", authenticate, isSuperAdmin, rtoController.testEmailTemplate);
router.post("/:rtoId/email-templates/send", authenticate, isSuperAdmin, rtoController.sendCustomEmail);
router.get("/:rtoId/email-templates/variables", authenticate, isSuperAdmin, rtoController.getEmailVariables);

module.exports = router; 