const express = require("express");
const router = express.Router();
const rtoController = require("../controllers/rtoController");
const { authenticate, authorize } = require("../middleware/auth");
const { rtoContext } = require("../middleware/rtoContext");
const { validateRTOAccess } = require("../middleware/rtoAccess");
const { allowRTODataAccess } = require("../middleware/rtoDataAccess");
const { upload } = require("../config/s3Config");

// Public routes (no auth required)
router.get("/branding/:rtoCode", rtoController.getBranding);

// Public routes (no auth required)
router.get("/:rtoCode", rtoController.getRTOByCode);

// Protected routes (auth required)
router.get("/", authenticate, validateRTOAccess, rtoController.getAllRTOs);

// Certified Admin routes (RTO management)
router.post("/", authenticate, validateRTOAccess, authorize("certified-admin"), upload.fields([
  { name: 'logo', maxCount: 1 },
  { name: 'confirmationOfEnrolment', maxCount: 1 },
  { name: 'offerLetter', maxCount: 1 },
  { name: 'invoiceTemplate', maxCount: 1 },
  { name: 'termsAndConditions', maxCount: 1 },
  { name: 'privacyPolicy', maxCount: 1 }
]), rtoController.createRTO);

router.put("/:rtoCode", authenticate, authorize("certified-admin"), upload.fields([
  { name: 'logo', maxCount: 1 },
  { name: 'confirmationOfEnrolment', maxCount: 1 },
  { name: 'offerLetter', maxCount: 1 },
  { name: 'invoiceTemplate', maxCount: 1 },
  { name: 'termsAndConditions', maxCount: 1 },
  { name: 'privacyPolicy', maxCount: 1 }
]), rtoController.updateRTO);

router.put("/:rtoCode/features", authenticate, authorize("certified-admin"), rtoController.updateFeatures);

// SMTP verification routes
router.post("/verify-smtp", authenticate, authorize("certified-admin"), rtoController.verifySMTPConfig);
router.post("/verify-smtp/quick", authenticate, authorize("certified-admin"), rtoController.quickVerifySMTP);

// Super Admin routes (default RTO management)
router.put("/:rtoCode/set-default", authenticate, authorize("super_admin"), rtoController.setDefaultRTO);
router.delete("/:rtoCode", authenticate, authorize("super_admin"), rtoController.deleteRTO);

module.exports = router;
