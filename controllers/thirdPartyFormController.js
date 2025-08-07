// controllers/thirdPartyFormController.js
const ThirdPartyFormSubmission = require("../models/thirdPartyFormSubmission");
const logme = require("../utils/logger");
const FormTemplate = require("../models/formTemplate");
const Application = require("../models/application");
const User = require("../models/user");
const crypto = require("crypto");
const emailService = require("../services/emailService");

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
      if (!formTemplate) {
        return res.status(404).json({
          success: false,
          message: "Form template not found",
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
        rtoId: application.rtoId, // Add RTO ID from application
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
      logme.error("Initiate third-party form error:", error);
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
      logme.error("Get third-party form error:", error);
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

      // If completed, create regular form submission
      if (thirdPartyForm.status === "completed") {
        await createFormSubmissionFromThirdParty(thirdPartyForm);
      }

      res.json({
        success: true,
        message: "Form submitted successfully",
        data: {
          status: thirdPartyForm.status,
          isFullyCompleted: thirdPartyForm.isFullyCompleted,
        },
      });
    } catch (error) {
      logme.error("Submit third-party form error:", error);
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
      logme.error("Get third-party form status error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching form status",
      });
    }
  },

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

      res.json({
        success: true,
        message: "Emails resent successfully",
      });
    } catch (error) {
      logme.error("Resend third-party emails error:", error);
      res.status(500).json({
        success: false,
        message: "Error resending emails",
      });
    }
  },
};

// Helper function to generate RTO-specific URLs
async function generateRTOUrl(rtoId, path) {
  const RTO = require("../models/rto");
  
  if (!rtoId) {
    return `${process.env.FRONTEND_URL || 'https://certified.io'}${path}`;
  }
  
  const rto = await RTO.findById(rtoId);
  if (!rto) {
    return `${process.env.FRONTEND_URL || 'https://certified.io'}${path}`;
  }
  
  return generateFormUrl(rto, path);
}

// Helper function to generate form URL
const generateFormUrl = (rto, path) => {
  if (!rto || !rto.subdomain) {
    return `${process.env.FRONTEND_URL || 'https://certified.io'}${path}`;
  }

  if (process.env.NODE_ENV === 'development') {
    // For local dev, use subdomain.localhost:5173
    return `http://${rto.subdomain}.localhost:5173${path}`;
  }

  // For production, use https://<subdomain>.certified.io
  return `https://${rto.subdomain}.certified.io${path}`;
};

// Helper functions
async function sendEmployerEmail(thirdPartyForm, formTemplate, user) {
  const emailService = require("../services/emailService2");
  
  const employerUrl = await generateRTOUrl(thirdPartyForm.rtoId, `/thirdpartyform/${thirdPartyForm.employerToken}`);

  await emailService.sendThirdPartyEmployerEmail(
    thirdPartyForm.employerEmail,
    thirdPartyForm.employerName,
    user,
    formTemplate,
    employerUrl,
    thirdPartyForm.rtoId
  );
}

async function sendReferenceEmail(thirdPartyForm, formTemplate, user) {
  const emailService = require("../services/emailService2");
  
  const referenceUrl = await generateRTOUrl(thirdPartyForm.rtoId, `/thirdpartyform/${thirdPartyForm.referenceToken}`);

  await emailService.sendThirdPartyReferenceEmail(
    thirdPartyForm.referenceEmail,
    thirdPartyForm.referenceName,
    user,
    formTemplate,
    referenceUrl,
    thirdPartyForm.rtoId
  );
}

async function sendCombinedEmail(thirdPartyForm, formTemplate, user) {
  const emailService = require("../services/emailService2");
  
  const combinedUrl = await generateRTOUrl(thirdPartyForm.rtoId, `/thirdpartyform/${thirdPartyForm.combinedToken}`);

  await emailService.sendThirdPartyCombinedEmail(
    thirdPartyForm.employerEmail,
    thirdPartyForm.employerName,
    thirdPartyForm.referenceName,
    user,
    formTemplate,
    combinedUrl,
    thirdPartyForm.rtoId
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

  await FormSubmission.create({
    applicationId: thirdPartyForm.applicationId,
    formTemplateId: thirdPartyForm.formTemplateId,
    userId: thirdPartyForm.userId,
    stepNumber: thirdPartyForm.stepNumber,
    filledBy: "third-party",
    formData: combinedFormData, // This should work now with sanitized keys
    status: "submitted",
    submittedAt: new Date(),
    metadata: {
      thirdPartySubmissionId: thirdPartyForm._id,
      employerName: thirdPartyForm.employerName,
      referenceName: thirdPartyForm.referenceName,
    },
  });
}

module.exports = thirdPartyFormController;
