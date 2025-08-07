// routes/certificationRoutes.js
const express = require("express");
const router = express.Router();
const certificationController = require("../controllers/certificateController");
const { authenticate, authorize, isSuperAdmin } = require("../middleware/auth");
const { identifyRTO } = require("../middleware/tenant");

// Apply RTO identification to all routes
router.use(identifyRTO);

// Public routes (for users to view available certifications)
router.get("/", certificationController.getAllCertifications);
router.get("/:id", certificationController.getCertificationById);

// Debug routes
router.get("/:certificationId/debug", authenticate, authorize("admin", "super_admin"), certificationController.debugRTOCertification);
router.get("/:certificationId/debug-form-templates", authenticate, authorize("admin", "super_admin"), certificationController.debugCertificationFormTemplates);

// Admin routes (for managing certifications)
router.post("/", authenticate, authorize("admin", "super_admin"), certificationController.createCertification);
router.put("/:id", authenticate, authorize("admin", "super_admin"), certificationController.updateCertification);
router.put("/:id/expense", authenticate, authorize("admin", "super_admin"), certificationController.updateCertificationExpense);
router.delete("/:id", authenticate, authorize("admin", "super_admin"), certificationController.deleteCertification);
router.patch("/:id/restore", authenticate, authorize("admin", "super_admin"), certificationController.restoreCertification);

module.exports = router;
