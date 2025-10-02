// routes/certificationRoutes.js
const express = require("express");
const router = express.Router();
const certificationController = require("../controllers/certificateController");
const { authenticate, authorize, isSuperAdmin } = require("../middleware/auth");
const { validateRTOAccess } = require("../middleware/rtoAccess");

// Public routes (for users to view available certifications)
router.get("/", certificationController.getAllCertifications);
router.get("/:id", authenticate, validateRTOAccess, certificationController.getCertificationById);

// Protected routes (require authentication)
router.post("/", authenticate, validateRTOAccess, authorize("admin", "super_admin", "certified-admin"), certificationController.createCertification);
router.put("/:id", authenticate, validateRTOAccess, authorize("admin", "super_admin", "certified-admin"), certificationController.updateCertification);
router.put("/:id/competencies", authenticate, validateRTOAccess, authorize("admin", "super_admin", "certified-admin"), certificationController.updateCertificationCompetencies);
router.put("/:id/expense", authenticate, validateRTOAccess, authorize("admin", "super_admin", "certified-admin"), certificationController.updateCertificationExpense);
router.delete("/:id", authenticate, validateRTOAccess, authorize("admin", "super_admin", "certified-admin"), certificationController.deleteCertification);
module.exports = router;
