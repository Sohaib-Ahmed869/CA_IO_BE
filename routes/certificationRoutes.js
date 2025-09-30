// routes/certificationRoutes.js
const express = require("express");
const router = express.Router();
const certificationController = require("../controllers/certificateController");
const { authenticate, authorize, isSuperAdmin } = require("../middleware/auth");
const { optionalRtoContext } = require("../middleware/rtoContext");

// Public routes (for users to view available certifications)
router.get("/", optionalRtoContext, certificationController.getAllCertifications);
router.get("/:id", authenticate, optionalRtoContext, certificationController.getCertificationById);

// Protected routes (require authentication)
router.post("/", authenticate, authorize("admin", "super_admin", "certified-admin"), optionalRtoContext, certificationController.createCertification);
router.put("/:id", authenticate, authorize("admin", "super_admin", "certified-admin"), optionalRtoContext, certificationController.updateCertification);
router.put("/:id/competencies", authenticate, authorize("admin", "super_admin", "certified-admin"), optionalRtoContext, certificationController.updateCertificationCompetencies);
router.put("/:id/expense", authenticate, authorize("admin", "super_admin", "certified-admin"), optionalRtoContext, certificationController.updateCertificationExpense);
router.delete("/:id", authenticate, authorize("admin", "super_admin", "certified-admin"), optionalRtoContext, certificationController.deleteCertification);
module.exports = router;
