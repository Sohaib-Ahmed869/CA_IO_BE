// controllers/thirdPartyFormController.js
const ThirdPartyFormSubmission = require("../models/thirdPartyFormSubmission");
const FormTemplate = require("../models/formTemplate");
const Application = require("../models/application");
const User = require("../models/user");
const crypto = require("crypto");
const emailService = require("../services/emailService2");

function sanitizeFormDataKeys(formData) {
  const sanitized = {};

  for (const [key, value] of Object.entries(formData)) {
    // Replace dots with underscores
    const sanitizedKey = key.replace(/\./g, "_");
    sanitized[sanitizedKey] = value;
  }

  return sanitized;
}

// Add this helper function to reverse the process when reading
function restoreFormDataKeys(formData) {
  const restored = {};

  for (const [key, value] of Object.entries(formData)) {
    // This is more complex - you might need to store original keys separately
    // or use a more sophisticated mapping
    restored[key] = value;
  }

  return restored;
}

const thirdPartyFormController = {
  // Student initiates third-party form
  initiateThirdPartyForm: async (req, res) => {
    try {
      const { applicationId, formTemplateId } = req.params;
      const { employerName, employerEmail, referenceName, referenceEmail } =
        req.body;
      const userId = req.user.id;

      // Verify application belongs to user
      const application = await Application.findOne({
        _id: applicationId,
        userId: userId,
      });

      if (!application) {
        return res.status(404).json({
          success: false,
          message: "Application not found",
        });
      }

      // Verify form template exists and is third-party
      const formTemplate = await FormTemplate.findById(formTemplateId);
      console.log(formTemplate);
      if (!formTemplate || formTemplate.filledBy !== "third-party") {
        return res.status(404).json({
          success: false,
          message: "Third-party form template not found",
        });
      }

      // Check if already exists
      const existing = await ThirdPartyFormSubmission.findOne({
        applicationId,
        formTemplateId,
      });

      if (existing) {
        return res.status(400).json({
          success: false,
          message: "Third-party form already initiated for this application",
        });
      }

      // Generate tokens
      const employerToken = crypto.randomBytes(32).toString("hex");
      const referenceToken = crypto.randomBytes(32).toString("hex");

      const isSameEmail =
        employerEmail.toLowerCase() === referenceEmail.toLowerCase();
      const combinedToken = isSameEmail
        ? crypto.randomBytes(32).toString("hex")
        : null;

      // Create third-party form submission
      const createData = {
        applicationId,
        formTemplateId,
        userId,
        employerName,
        employerEmail: employerEmail.toLowerCase(),
        referenceName,
        referenceEmail: referenceEmail.toLowerCase(),
        employerToken,
        referenceToken,
        stepNumber: formTemplate.stepNumber,
        employerSubmission: {
          formData: {},
          isSubmitted: false,
        },
        referenceSubmission: {
          formData: {},
          isSubmitted: false,
        },
      };

      // Only add combinedToken and combinedSubmission if same email
      if (isSameEmail) {
        createData.combinedToken = combinedToken;
        createData.combinedSubmission = {
          formData: {},
          isSubmitted: false,
        };
      }

      const thirdPartyForm = await ThirdPartyFormSubmission.create(createData);

      // Send emails
      const user = await User.findById(userId);

      if (isSameEmail) {
        await sendCombinedEmail(thirdPartyForm, formTemplate, user);
        thirdPartyForm.combinedEmailSent = true;
      } else {
        await sendEmployerEmail(thirdPartyForm, formTemplate, user);
        await sendReferenceEmail(thirdPartyForm, formTemplate, user);
        thirdPartyForm.employerEmailSent = true;
        thirdPartyForm.referenceEmailSent = true;
      }

      await thirdPartyForm.save();

      res.status(201).json({
        success: true,
        message: "Third-party form initiated successfully. Emails sent.",
        data: {
          id: thirdPartyForm._id,
          status: thirdPartyForm.status,
          isSameEmail,
          employerEmailSent: thirdPartyForm.employerEmailSent,
          referenceEmailSent: thirdPartyForm.referenceEmailSent,
          combinedEmailSent: thirdPartyForm.combinedEmailSent,
        },
      });
    } catch (error) {
      console.error("Initiate third-party form error:", error);
      res.status(500).json({
        success: false,
        message: "Error initiating third-party form",
      });
    }
  },

  // Get form for third-party to fill
  getThirdPartyForm: async (req, res) => {
    try {
      const { token } = req.params;

      const thirdPartyForm = await ThirdPartyFormSubmission.findOne({
        $or: [
          { employerToken: token },
          { referenceToken: token },
          { combinedToken: token },
        ],
        isActive: true,
        expiresAt: { $gt: new Date() },
      })
        .populate("formTemplateId")
        .populate("applicationId")
        .populate({
          path: "userId",
          select: "firstName lastName email",
        });

      if (!thirdPartyForm) {
        return res.status(404).json({
          success: false,
          message: "Form not found or expired",
        });
      }

      // Determine who is accessing
      let accessType;
      let existingData = {};

      if (thirdPartyForm.combinedToken === token) {
        accessType = "combined";
        existingData = thirdPartyForm.combinedSubmission.formData || {};
      } else if (thirdPartyForm.employerToken === token) {
        accessType = "employer";
        existingData = thirdPartyForm.employerSubmission.formData || {};
      } else if (thirdPartyForm.referenceToken === token) {
        accessType = "reference";
        existingData = thirdPartyForm.referenceSubmission.formData || {};
      }

      res.json({
        success: true,
        data: {
          formTemplate: thirdPartyForm.formTemplateId,
          student: thirdPartyForm.userId,
          accessType,
          employerName: thirdPartyForm.employerName,
          referenceName: thirdPartyForm.referenceName,
          existingData,
          expiresAt: thirdPartyForm.expiresAt,
          isSameEmail: thirdPartyForm.isSameEmail,
        },
      });
    } catch (error) {
      console.error("Get third-party form error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching form",
      });
    }
  },

  // Submit third-party form
  submitThirdPartyForm: async (req, res) => {
    try {
      const { token } = req.params;
      const { formData } = req.body;
      const ipAddress = req.ip;
      const userAgent = req.get("User-Agent");

      const thirdPartyForm = await ThirdPartyFormSubmission.findOne({
        $or: [
          { employerToken: token },
          { referenceToken: token },
          { combinedToken: token },
        ],
        isActive: true,
        expiresAt: { $gt: new Date() },
      });

      if (!thirdPartyForm) {
        return res.status(404).json({
          success: false,
          message: "Form not found or expired",
        });
      }

      // Sanitize formData keys before saving
      const sanitizedFormData = sanitizeFormDataKeys(formData);

      // Determine submission type and update accordingly
      const submissionData = {
        formData: sanitizedFormData, // Use sanitized data
        submittedAt: new Date(),
        ipAddress,
        userAgent,
        isSubmitted: true,
      };

      if (thirdPartyForm.combinedToken === token) {
        thirdPartyForm.combinedSubmission = submissionData;
      } else if (thirdPartyForm.employerToken === token) {
        thirdPartyForm.employerSubmission = submissionData;
      } else if (thirdPartyForm.referenceToken === token) {
        thirdPartyForm.referenceSubmission = submissionData;
      }

      // Update overall status
      if (thirdPartyForm.isFullyCompleted) {
        thirdPartyForm.status = "completed";
      } else {
        thirdPartyForm.status = "partially_completed";
      }

      await thirdPartyForm.save();

      // Send email notification to student about the submission
      try {
        // Get populated data for email
        const populatedForm = await ThirdPartyFormSubmission.findById(thirdPartyForm._id)
          .populate("applicationId")
          .populate("formTemplateId")
          .populate("userId");

        const application = populatedForm.applicationId;
        const student = populatedForm.userId;
        const formTemplate = populatedForm.formTemplateId;

        // Get certification details
        const Application = require("../models/application");
        const fullApplication = await Application.findById(application._id)
          .populate("certificationId", "name");

        // Determine submission type
        let submissionType = "";
        if (thirdPartyForm.combinedToken === token) {
          submissionType = "combined";
        } else if (thirdPartyForm.employerToken === token) {
          submissionType = "employer";
        } else if (thirdPartyForm.referenceToken === token) {
          submissionType = "reference";
        }

        const EmailHelpers = require("../utils/emailHelpers");
        await EmailHelpers.handleThirdPartyFormSubmission(
          student,
          fullApplication,
          fullApplication.certificationId,
          formTemplate,
          thirdPartyForm,
          submissionType
        );
        console.log(`Third-party submission notification sent to student: ${student.email}`);
      } catch (emailError) {
        console.error("Error sending third-party submission notification email:", emailError);
        // Don't fail the submission if email fails
      }

      // Handle form submission creation/update
      let formSubmission = null;
      if (thirdPartyForm.status === "completed") {
        // Form is fully completed, create/update the FormSubmission
        formSubmission = await createFormSubmissionFromThirdParty(thirdPartyForm);
      } else {
        // Form is partially completed, check if FormSubmission already exists (from previous complete submission that was marked for resubmission)
        const FormSubmission = require("../models/formSubmission");
        const existingSubmission = await FormSubmission.findOne({
          applicationId: thirdPartyForm.applicationId,
          formTemplateId: thirdPartyForm.formTemplateId,
          filledBy: "third-party",
        });
        
        if (existingSubmission) {
          formSubmission = existingSubmission;
          console.log(`Found existing FormSubmission during partial completion: ${existingSubmission._id}, version: ${existingSubmission.version}`);
        }
      }

      res.json({
        success: true,
        message: "Form submitted successfully",
        data: {
          status: thirdPartyForm.status,
          isFullyCompleted: thirdPartyForm.isFullyCompleted,
          formSubmission: formSubmission ? {
            id: formSubmission._id,
            version: formSubmission.version,
            submittedAt: formSubmission.submittedAt,
            resubmissionRequired: formSubmission.resubmissionRequired,
            assessed: formSubmission.assessed,
          } : null,
        },
      });
    } catch (error) {
      console.error("Submit third-party form error:", error);
      res.status(500).json({
        success: false,
        message: "Error submitting form",
      });
    }
  },



  // Get third-party form status for student
  getThirdPartyFormStatus: async (req, res) => {
    try {
      const { applicationId, formTemplateId } = req.params;
      const userId = req.user.id;

      const thirdPartyForm = await ThirdPartyFormSubmission.findOne({
        applicationId,
        formTemplateId,
        userId,
      });

      if (!thirdPartyForm) {
        return res.status(404).json({
          success: false,
          message: "Third-party form not found",
        });
      }

      res.json({
        success: true,
        data: {
          status: thirdPartyForm.status,
          employerName: thirdPartyForm.employerName,
          referenceName: thirdPartyForm.referenceName,
          employerSubmitted: thirdPartyForm.employerSubmission.isSubmitted,
          referenceSubmitted: thirdPartyForm.referenceSubmission.isSubmitted,
          combinedSubmitted: thirdPartyForm.combinedSubmission.isSubmitted,
          isSameEmail: thirdPartyForm.isSameEmail,
          isFullyCompleted: thirdPartyForm.isFullyCompleted,
          expiresAt: thirdPartyForm.expiresAt,
        },
      });
    } catch (error) {
      console.error("Get third-party form status error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching form status",
      });
    }
  },

  // Resend emails
  // Resend emails
  resendThirdPartyEmails: async (req, res) => {
    try {
      const { applicationId, formTemplateId } = req.params;
      const userId = req.user.id;

      const thirdPartyForm = await ThirdPartyFormSubmission.findOne({
        applicationId,
        formTemplateId,
        userId,
      }).populate("formTemplateId");

      if (!thirdPartyForm) {
        return res.status(404).json({
          success: false,
          message: "Third-party form not found",
        });
      }

      const user = await User.findById(userId);

      if (thirdPartyForm.isSameEmail) {
        await sendCombinedEmail(
          thirdPartyForm,
          thirdPartyForm.formTemplateId,
          user
        );
      } else {
        await sendEmployerEmail(
          thirdPartyForm,
          thirdPartyForm.formTemplateId,
          user
        );
        await sendReferenceEmail(
          thirdPartyForm,
          thirdPartyForm.formTemplateId,
          user
        );
      }

      // Note: We DON'T clear resubmissionRequired here because resending emails 
      // doesn't mean the form has been resubmitted. The flag should only be cleared
      // when the third-party actually submits the form again.
      console.log(`Resent third-party emails for application: ${applicationId}, form: ${formTemplateId}`);

      res.json({
        success: true,
        message: "Emails resent successfully",
      });
    } catch (error) {
      console.error("Resend third-party emails error:", error);
      res.status(500).json({
        success: false,
        message: "Error resending emails",
      });
    }
  },

  // Admin sends TPR verification email(s)
  sendVerification: async (req, res) => {
    try {
      const { tprId } = req.params;
      const { target } = req.body; // employer | reference | both

      let tpr = tprId && tprId !== 'NEW' ? await ThirdPartyFormSubmission.findById(tprId).populate("applicationId", "userId certificationId") : null;

      // If not found by id, try to locate by applicationId + formTemplateId
      if (!tpr) {
        const { applicationId, formTemplateId, employerEmail, referenceEmail } = req.body || {};
        if (applicationId && formTemplateId) {
          tpr = await ThirdPartyFormSubmission.findOne({ applicationId, formTemplateId });
        }
        // Fallback: if still not found and we have emails, try by applicationId + emails
        if (!tpr && applicationId && (employerEmail || referenceEmail)) {
          const q = { applicationId };
          if (employerEmail) q.employerEmail = employerEmail.toLowerCase();
          if (referenceEmail) q.referenceEmail = referenceEmail.toLowerCase();
          tpr = await ThirdPartyFormSubmission.findOne(q);
        }
        // Final fallback: only applicationId → pick most recent TPR for that application
        if (!tpr && applicationId) {
          tpr = await ThirdPartyFormSubmission.findOne({ applicationId }).sort({ createdAt: -1 });
        }
      }

      // If still no TPR, support bootstrap creation using payload
      if (!tpr) {
        const { applicationId, formTemplateId, employerName, employerEmail, referenceName, referenceEmail } = req.body || {};
        if (!applicationId) {
          return res.status(404).json({ success: false, message: "TPR not found for this application. Provide applicationId (we'll use most recent), or include formTemplateId, or include employer/reference details to create a new TPR." });
        }
        const appExists = await Application.findById(applicationId);
        if (!appExists) {
          return res.status(400).json({ success: false, message: "Invalid applicationId" });
        }
        if (!formTemplateId || !employerName || !employerEmail || !referenceName || !referenceEmail) {
          return res.status(400).json({ success: false, message: "Missing fields to create new TPR. Provide formTemplateId, employerName/employerEmail, referenceName/referenceEmail." });
        }
        const ft = await FormTemplate.findById(formTemplateId);
        if (!ft) return res.status(400).json({ success: false, message: "Invalid formTemplateId" });
        // Generate access tokens required by schema
        const employerToken = crypto.randomBytes(32).toString("hex");
        const referenceToken = crypto.randomBytes(32).toString("hex");

        tpr = await ThirdPartyFormSubmission.create({
          applicationId,
          formTemplateId,
          userId: appExists.userId,
          employerName,
          employerEmail: employerEmail.toLowerCase(),
          referenceName,
          referenceEmail: referenceEmail.toLowerCase(),
          employerToken,
          referenceToken,
          stepNumber: ft.stepNumber,
          employerSubmission: { formData: {}, isSubmitted: false },
          referenceSubmission: { formData: {}, isSubmitted: false },
        });
      }

      const app = await Application.findById(tpr.applicationId).populate("userId", "firstName lastName").populate("certificationId", "name");
      const studentName = `${app.userId.firstName} ${app.userId.lastName}`;
      const qualificationName = app.certificationId.name;
      const rtoName = process.env.RTO_NAME || "ALIT";
      const rtoCode = process.env.RTO_CODE || "RTO NUMBER";
      const rtoNumber = `${rtoName} ${rtoCode}`;

      const toSend = (target === 'both' || !target) ? ['employer','reference'] : [target];
      const updates = {};

      for (const t of toSend) {
        let recipientEmail, recipientName;
        if (t === 'employer') { recipientEmail = tpr.employerEmail; recipientName = tpr.employerName; }
        if (t === 'reference') { recipientEmail = tpr.referenceEmail; recipientName = tpr.referenceName; }
        const token = crypto.randomBytes(24).toString('hex');
        const shortCode = String(Math.floor(100000 + Math.random() * 900000));
        updates[`verification.${t}.token`] = token;
        updates[`verification.${t}.shortCode`] = shortCode;
        updates[`verification.${t}.sentAt`] = new Date();
        updates[`verification.${t}.status`] = 'pending';

        const { subject, html, messageId } = await emailService.sendTPRVerificationEmail(recipientEmail, {
          recipientName, studentName, qualificationName, rtoNumber, token, shortCode
        });
        updates[`verification.${t}.lastSentSubject`] = subject || 'Employment Verification Request';
        updates[`verification.${t}.lastSentContent`] = html || '';
        if (messageId) updates[`verification.${t}.lastSentMessageId`] = messageId;
      }

      // Aggregate top-level status
      updates.verificationStatus = 'pending';
      await ThirdPartyFormSubmission.findByIdAndUpdate(tpr._id, { $set: updates });

      return res.json({ success: true, message: 'Verification email(s) sent', tprId: String(tpr._id) });
    } catch (error) {
      console.error('Send TPR verification error:', error);
      res.status(500).json({ success: false, message: 'Error sending verification' });
    }
  },

  // Record free-text response from email/portal and optionally mark verified/rejected; also can be used to lock UI
  setVerificationResponse: async (req, res) => {
    try {
      const { tprId, target } = req.params; // target: employer|reference|combined
      const { responseContent, decision } = req.body; // decision optional
      const allowed = ['employer','reference','combined'];
      if (!allowed.includes(target)) return res.status(400).json({ success:false, message:'Invalid target' });

      const tpr = await ThirdPartyFormSubmission.findById(tprId);
      if (!tpr) return res.status(404).json({ success:false, message:'TPR not found' });

      const setObj = {};
      if (responseContent) setObj[`verification.${target}.responseContent`] = responseContent;
      if (decision) {
        setObj[`verification.${target}.status`] = (decision === 'verified') ? 'verified' : (decision === 'rejected' ? 'rejected' : 'pending');
        if (decision === 'verified' || decision === 'rejected') setObj[`verification.${target}.verifiedAt`] = new Date();
      }
      await ThirdPartyFormSubmission.findByIdAndUpdate(tprId, { $set: setObj });

      // Recompute aggregate
      const updated = await ThirdPartyFormSubmission.findById(tprId);
      const parts = [updated.verification?.employer?.status, updated.verification?.reference?.status];
      if (updated.isSameEmail) parts.push(updated.verification?.combined?.status);
      let aggregate = 'pending';
      if (parts.every(s => s === 'verified' || s === 'not_sent')) aggregate = 'verified';
      if (parts.some(s => s === 'rejected')) aggregate = 'rejected';
      await ThirdPartyFormSubmission.findByIdAndUpdate(tprId, { $set: { verificationStatus: aggregate } });

      return res.json({ success:true, data: { verificationStatus: aggregate } });
    } catch (error) {
      console.error('Set verification response error:', error);
      res.status(500).json({ success:false, message:'Error saving response' });
    }
  },

  // Public verify endpoint (token-based)
  verifyByToken: async (req, res) => {
    try {
      const { token, decision } = req.body; // decision: verified | rejected
      if (!token || !decision) return res.status(400).json({ success: false, message: 'token and decision required' });

      const tpr = await ThirdPartyFormSubmission.findOne({
        $or: [
          { 'verification.employer.token': token },
          { 'verification.reference.token': token },
          { 'verification.combined.token': token },
        ],
      });
      if (!tpr) return res.status(404).json({ success: false, message: 'Invalid or expired token' });

      const path = tpr.verification?.employer?.token === token ? 'employer' :
                   tpr.verification?.reference?.token === token ? 'reference' : 'combined';

      const setObj = {};
      setObj[`verification.${path}.status`] = decision === 'verified' ? 'verified' : 'rejected';
      setObj[`verification.${path}.verifiedAt`] = new Date();

      // Update aggregate status
      await ThirdPartyFormSubmission.findByIdAndUpdate(tpr._id, { $set: setObj });
      const updated = await ThirdPartyFormSubmission.findById(tpr._id);
      const parts = [updated.verification?.employer?.status, updated.verification?.reference?.status];
      if (updated.isSameEmail) parts.push(updated.verification?.combined?.status);
      let aggregate = 'pending';
      if (parts.every(s => s === 'verified' || s === 'not_sent')) aggregate = 'verified';
      if (parts.some(s => s === 'rejected')) aggregate = 'rejected';
      await ThirdPartyFormSubmission.findByIdAndUpdate(tpr._id, { $set: { verificationStatus: aggregate } });

      return res.json({ success: true, data: { verificationStatus: aggregate } });
    } catch (error) {
      console.error('TPR verify error:', error);
      res.status(500).json({ success: false, message: 'Error verifying' });
    }
  },

  // Status
  getVerificationStatus: async (req, res) => {
    try {
      const { tprId } = req.params;
      const tpr = await ThirdPartyFormSubmission.findById(tprId).select('verification verificationStatus');
      if (!tpr) return res.status(404).json({ success: false, message: 'TPR not found' });
      return res.json({ success: true, data: tpr });
    } catch (error) {
      console.error('Get TPR verification status error:', error);
      res.status(500).json({ success: false, message: 'Error fetching status' });
    }
  },
};

// Helper functions
async function sendEmployerEmail(thirdPartyForm, formTemplate, user) {
  const emailService = require("../services/emailService2");
  const employerUrl = `${process.env.FRONTEND_URL}/thirdpartyform/${thirdPartyForm.employerToken}`;

  await emailService.sendThirdPartyEmployerEmail(
    thirdPartyForm.employerEmail,
    thirdPartyForm.employerName,
    user,
    formTemplate,
    employerUrl
  );
}

async function sendReferenceEmail(thirdPartyForm, formTemplate, user) {
  const emailService = require("../services/emailService2");
  const referenceUrl = `${process.env.FRONTEND_URL}/thirdpartyform/${thirdPartyForm.referenceToken}`;

  await emailService.sendThirdPartyReferenceEmail(
    thirdPartyForm.referenceEmail,
    thirdPartyForm.referenceName,
    user,
    formTemplate,
    referenceUrl
  );
}

async function sendCombinedEmail(thirdPartyForm, formTemplate, user) {
  const emailService = require("../services/emailService2");
  const combinedUrl = `${process.env.FRONTEND_URL}/thirdpartyform/${thirdPartyForm.combinedToken}`;

  await emailService.sendThirdPartyCombinedEmail(
    thirdPartyForm.employerEmail,
    thirdPartyForm.employerName,
    thirdPartyForm.referenceName,
    user,
    formTemplate,
    combinedUrl
  );
}
async function createFormSubmissionFromThirdParty(thirdPartyForm) {
  const FormSubmission = require("../models/formSubmission");

  let combinedFormData = {};

  if (thirdPartyForm.isSameEmail) {
    combinedFormData = thirdPartyForm.combinedSubmission.formData;
  } else {
    // Merge employer and reference data
    combinedFormData = {
      ...thirdPartyForm.employerSubmission.formData,
      ...thirdPartyForm.referenceSubmission.formData,
    };
  }

  // Check if this is a resubmission by looking for existing submission
  const existingSubmission = await FormSubmission.findOne({
    applicationId: thirdPartyForm.applicationId,
    formTemplateId: thirdPartyForm.formTemplateId,
    filledBy: "third-party",
  });

  let isResubmission = false;
  let submission;

  if (existingSubmission) {
    // This submission already exists - check if it's truly a resubmission
    isResubmission = existingSubmission.resubmissionRequired === true;
    
    console.log(`Found existing TPR submission: ${existingSubmission._id}, resubmissionRequired: ${existingSubmission.resubmissionRequired}, currentVersion: ${existingSubmission.version}, status: ${existingSubmission.status}`);
    
    // Only increment version if this is actually marked for resubmission
    if (isResubmission) {
      // Store previous version
      existingSubmission.previousVersions.push({
        formData: existingSubmission.formData,
        submittedAt: existingSubmission.submittedAt,
        version: existingSubmission.version,
      });
      
      // Increment version for resubmission
      existingSubmission.version += 1;
      console.log(`TRUE RESUBMISSION - Incrementing version to: ${existingSubmission.version}`);
    } else {
      // If this is not a resubmission but version is > 1, reset to 1 (fix corrupted data)
      if (existingSubmission.version > 1) {
        console.log(`FIXING CORRUPTED VERSION - Resetting version from ${existingSubmission.version} to 1`);
        existingSubmission.version = 1;
      } else {
        console.log(`NOT A RESUBMISSION - Keeping version: ${existingSubmission.version}`);
      }
    }

    // Update with new data
    existingSubmission.formData = combinedFormData;
    existingSubmission.status = "submitted";
    existingSubmission.submittedAt = new Date();
    existingSubmission.assessedBy = undefined;
    existingSubmission.assessedAt = undefined;
    existingSubmission.assessmentNotes = undefined;
    existingSubmission.assessorFeedback = undefined;
    existingSubmission.resubmissionRequired = false; // ALWAYS clear this flag
    existingSubmission.assessed = "pending"; // Reset assessment status

    submission = await existingSubmission.save();
    console.log(`Updated existing TPR submission: ${submission._id}, finalVersion: ${submission.version}, resubmissionRequired: ${submission.resubmissionRequired}`);
  } else {
    // Create new submission
    submission = await FormSubmission.create({
    applicationId: thirdPartyForm.applicationId,
    formTemplateId: thirdPartyForm.formTemplateId,
    userId: thirdPartyForm.userId,
    stepNumber: thirdPartyForm.stepNumber,
    filledBy: "third-party",
      formData: combinedFormData,
    status: "submitted",
    submittedAt: new Date(),
      version: 1,
      assessed: "pending",
      resubmissionRequired: false,
    metadata: {
      thirdPartySubmissionId: thirdPartyForm._id,
      employerName: thirdPartyForm.employerName,
      referenceName: thirdPartyForm.referenceName,
    },
  });
    console.log(`Created new TPR submission: ${submission._id}, version: ${submission.version}`);
  }

  // Send email notification to assessor if this is a resubmission
  if (isResubmission) {
    try {
      const application = await Application.findById(thirdPartyForm.applicationId)
        .populate("assignedAssessor", "firstName lastName email")
        .populate("userId", "firstName lastName email")
        .populate("certificationId", "name");

      const populatedSubmission = await FormSubmission.findById(submission._id)
        .populate("formTemplateId", "name");

      if (application && application.assignedAssessor) {
        const EmailHelpers = require("../utils/emailHelpers");
        await EmailHelpers.handleResubmissionCompleted(
          application.assignedAssessor,
          application.userId,
          populatedSubmission,
          application,
          application.certificationId
        );
        console.log(`Third-party resubmission notification sent to assessor: ${application.assignedAssessor.email}, version: ${populatedSubmission.version}`);
      }
    } catch (emailError) {
      console.error("Error sending third-party resubmission notification email:", emailError);
    }
  }

  // Update application steps after form submission
  try {
    const { updateApplicationStep } = require("../utils/stepCalculator");
    await updateApplicationStep(thirdPartyForm.applicationId);
    console.log(`Updated application steps for ${thirdPartyForm.applicationId}`);
  } catch (stepError) {
    console.error("Error updating application steps:", stepError);
    // Don't fail the submission if step update fails
  }

  return submission;
}

module.exports = thirdPartyFormController;
