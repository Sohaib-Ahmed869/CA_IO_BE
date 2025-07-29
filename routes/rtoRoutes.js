// routes/rtoRoutes.js
const express = require("express");
const router = express.Router();
const rtoController = require("../controllers/rtoController");
const { authenticate, isSuperAdmin } = require("../middleware/auth");
const multer = require("multer");
const { upload } = require("../config/s3Config");


// Apply middleware to all routes
router.use(authenticate);
router.use(isSuperAdmin);

// RTO CRUD routes
router.post("/", rtoController.createRTO);
router.get("/", rtoController.getAllRTOs);
router.get("/:id", rtoController.getRTOById);
router.put("/:id", rtoController.updateRTO);
router.delete("/:id", rtoController.deleteRTO);

// Email templates and features
router.put("/:id/email-templates", rtoController.updateEmailTemplates);
router.put("/:id/features", rtoController.updateFeatures);

// Asset Management routes
router.post("/:rtoId/logo", upload.single("logo"), rtoController.uploadLogo);
router.post("/:rtoId/documents", upload.single("document"), rtoController.uploadDocument);
router.get("/:rtoId/assets", rtoController.getAssets);
router.delete("/:rtoId/documents/:documentId", rtoController.deleteDocument);
router.put("/:rtoId/documents/:documentId/status", rtoController.updateDocumentStatus);

// RTO User Management routes
router.post("/:rtoId/users", rtoController.createRTOUser);
router.get("/:rtoId/users", rtoController.getRTOUsers);
router.put("/:rtoId/users/:userId", rtoController.updateRTOUser);
router.delete("/:rtoId/users/:userId", rtoController.deleteRTOUser);

module.exports = router; 