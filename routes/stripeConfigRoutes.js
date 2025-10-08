// routes/stripeConfigRoutes.js
const express = require("express");
const router = express.Router();
const { authenticate, authorize } = require("../middleware/auth");
const { validateRTOAccess } = require("../middleware/rtoAccess");
const stripeConfigController = require("../controllers/stripeConfigController");

// All routes require authentication
router.use(authenticate);

// Test Stripe keys without transactions (no RTO context needed) - MUST BE BEFORE /:rtoId routes
router.post("/test-keys", 
  authorize("admin", "super_admin", "certified-admin"), 
  stripeConfigController.testStripeKeys
);

// Admin-only routes (no RTO context needed) - MUST BE BEFORE /:rtoId routes
router.get("/", 
  authorize("super_admin", "certified-admin"), 
  stripeConfigController.getAllStripeConfigs
);

router.post("/verify-all", 
  authorize("super_admin", "certified-admin"), 
  stripeConfigController.verifyAllStripeConfigs
);

// RTO-specific Stripe configuration routes
router.post("/:rtoId", 
  validateRTOAccess, 
  authorize("admin", "super_admin", "certified-admin"), 
  stripeConfigController.createStripeConfig
);

router.get("/:rtoId", 
  validateRTOAccess, 
  authorize("admin", "super_admin", "certified-admin"), 
  stripeConfigController.getStripeConfig
);

router.put("/:rtoId", 
  validateRTOAccess, 
  authorize("admin", "super_admin", "certified-admin"), 
  stripeConfigController.updateStripeConfig
);

router.delete("/:rtoId", 
  validateRTOAccess, 
  authorize("admin", "super_admin", "certified-admin"), 
  stripeConfigController.deleteStripeConfig
);

router.post("/:rtoId/test", 
  validateRTOAccess, 
  authorize("admin", "super_admin", "certified-admin"), 
  stripeConfigController.testStripeConnection
);

router.post("/:rtoId/validate", 
  validateRTOAccess, 
  authorize("admin", "super_admin", "certified-admin"), 
  stripeConfigController.validateStripeKeys
);

// Verification routes
router.post("/:rtoId/verify", 
  validateRTOAccess, 
  authorize("admin", "super_admin", "certified-admin"), 
  stripeConfigController.verifyStripeConfig
);

module.exports = router;
