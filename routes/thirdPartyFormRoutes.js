// routes/thirdPartyFormRoutes.js
const express = require("express");
const router = express.Router();
const { authenticate, authorize } = require("../middleware/auth");
const thirdPartyFormController = require("../controllers/thirdPartyFormController");
const { pollTPRForApplication } = require("../utils/tprEmailPoller");

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

// Application-specific verification poll
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

// GET alias for environments that cannot POST easily
router.get(
  "/application/:applicationId/verification/poll",
  authenticate,
  authorize("admin", "assessor", "super_admin"),
  async (req, res) => {
    try {
      const { applicationId } = req.params;
      console.log(`[TPR-IMAP][API][GET] poll request app=${applicationId}`);
      const summary = await pollTPRForApplication(applicationId);
      console.log(`[TPR-IMAP][API][GET] poll result app=${applicationId}:`, summary);
      return res.json({ success: true, data: summary, verified: !!summary?.verified });
    } catch (e) {
      console.error('TPR application poll (GET) error:', e);
      return res.status(500).json({ success: false, message: 'Error polling mailbox for this application' });
    }
  }
);

module.exports = router;
