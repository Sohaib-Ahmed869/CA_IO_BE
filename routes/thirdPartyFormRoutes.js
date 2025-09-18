// routes/thirdPartyFormRoutes.js
const express = require("express");
const router = express.Router();
const { authenticate, authorize } = require("../middleware/auth");
const { pollTPRForApplication } = require("../utils/tprEmailPoller");
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

// Admin: send verification emails
router.post("/:tprId/verification/send", authenticate, authorize("admin", "assessor", "super_admin"), thirdPartyFormController.sendVerification);

// Application-specific poll endpoint: scans last 200 messages and stops on first match
router.post(
  "/application/:applicationId/verification/poll",
  authenticate,
  authorize("admin", "assessor", "super_admin"),
  async (req, res) => {
    try {
      const { applicationId } = req.params;
      console.log(`[TPR-IMAP][API] poll request app=${applicationId}`);
      const summary = await pollTPRForApplication(applicationId);
      console.log(`[TPR-IMAP][API] poll result app=${applicationId}:`, summary);
      return res.json({ success: true, data: summary, verified: !!summary?.verified });
    } catch (e) {
      console.error('TPR application poll error:', e);
      return res.status(500).json({ success: false, message: 'Error polling mailbox for this application' });
    }
  }
);

// Public: verify by token (no auth)
router.post("/verification/verify", thirdPartyFormController.verifyByToken);

// Auth: get status
router.get("/:tprId/verification/status", authenticate, authorize("admin", "assessor", "super_admin"), thirdPartyFormController.getVerificationStatus);

// Auth: set verification response content/decision (to reflect manual emails or portal inputs)
router.post("/:tprId/verification/:target/response", authenticate, authorize("admin", "assessor", "super_admin"), thirdPartyFormController.setVerificationResponse);

module.exports = router;
