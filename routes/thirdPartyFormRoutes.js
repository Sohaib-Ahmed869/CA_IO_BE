// routes/thirdPartyFormRoutes.js
const express = require("express");
const router = express.Router();
const { authenticate } = require("../middleware/auth");
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

module.exports = router;
