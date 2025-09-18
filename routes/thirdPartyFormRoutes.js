// routes/thirdPartyFormRoutes.js
const express = require("express");
const router = express.Router();
const { authenticate, authorize } = require("../middleware/auth");
const thirdPartyFormController = require("../controllers/thirdPartyFormController");

// Student routes (require authentication)
router.post(
  "/application/:applicationId/form/:formTemplateId/initiate",
  authenticate,
  thirdPartyFormController.initiateThirdPartyForm
);

router.get(
  "/application/:applicationId/form/:formTemplateId/status",
  authenticate,
  thirdPartyFormController.getThirdPartyFormStatus
);

router.post(
  "/application/:applicationId/form/:formTemplateId/resend",
  authenticate,
  thirdPartyFormController.resendThirdPartyEmails
);

// Public routes (no authentication - accessed via token)
router.get("/form/:token", thirdPartyFormController.getThirdPartyForm);

router.post(
  "/form/:token/submit",
  thirdPartyFormController.submitThirdPartyForm
);

// Admin/Assessor: send verification emails for an existing TPR
// Option A: explicit path id
router.post(
  "/:tprId/verification/send",
  authenticate,
  authorize("admin", "assessor", "super_admin"),
  thirdPartyFormController.sendVerification
);

// Option B: lookup via body (tprId or applicationId+formTemplateId)
router.post(
  "/verification/send",
  authenticate,
  authorize("admin", "assessor", "super_admin"),
  thirdPartyFormController.sendVerification
);

module.exports = router;
