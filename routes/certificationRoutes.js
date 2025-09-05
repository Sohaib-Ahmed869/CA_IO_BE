// routes/certificationRoutes.js
const express = require("express");
const router = express.Router();
const certificationController = require("../controllers/certificateController");
const { authenticate, authorize, isSuperAdmin } = require("../middleware/auth");

// Public routes (for users to view available certifications)
router.get("/", certificationController.getAllCertifications);
router.get("/:id", authenticate, certificationController.getCertificationById);

// Protected routes (require authentication)
router.post("/", authenticate, authorize("admin", "super_admin"), certificationController.createCertification);
router.put("/:id", authenticate, authorize("admin", "super_admin"), certificationController.updateCertification);
router.put("/:id/competencies", authenticate, authorize("admin", "super_admin"), certificationController.updateCertificationCompetencies);
router.put("/:id/expense", authenticate, authorize("admin", "super_admin"), certificationController.updateCertificationExpense);
router.delete("/:id", authenticate, authorize("admin", "super_admin"), certificationController.deleteCertification);
module.exports = router;
