// controllers/thirdPartyFormController.js
const ThirdPartyFormSubmission = require("../models/thirdPartyFormSubmission");
const FormTemplate = require("../models/formTemplate");
const Application = require("../models/application");
const User = require("../models/user");
const crypto = require("crypto");
const emailService = require("../services/emailService2");
const {
  isAssessorOnly,
  validateAssessorOnlyFields,
} = require("../utils/assessorFieldDetector");

function sanitizeFormDataKeys(formData) {
  const sanitized = {};

  for (const [key, value] of Object.entries(formData)) {
    // Replace dots with underscores
    const sanitizedKey = key.replace(/\./g, "_");
    sanitized[sanitizedKey] = value;
  }

  return sanitized;
}

function restoreFormDataKeys(formData = {}) {
  return { ...formData };
}

function isValidEmail(email) {
  return /\S+@\S+\.\S+/.test(String(email || "").trim());
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

      // Debug logging to help trace token-based lookups in all environments
      console.log("[ThirdPartyForm][GET] Incoming third-party form request", {
        token,
        url: req.originalUrl,
        ip: req.ip,
        time: new Date().toISOString(),
      });

      const thirdPartyForm = await ThirdPartyFormSubmission.findOne({
        $or: [
          { employerToken: token },
          { referenceToken: token },
          { combinedToken: token },
        ],
        // Backwards compatible: older records may not have these fields set
        $and: [
          { $or: [{ isActive: true }, { isActive: { $exists: false } }] },
          { $or: [{ expiresAt: { $gt: new Date() } }, { expiresAt: { $exists: false } }] },
        ],
      })
        .populate("formTemplateId")
        .populate("applicationId")
        .populate({
          path: "userId",
          select: "firstName lastName email",
        });

      if (!thirdPartyForm) {
        // Extra debug to see if we have a record that fails only the isActive/expiry guards
        const rawMatch = await ThirdPartyFormSubmission.findOne({
          $or: [
            { employerToken: token },
            { referenceToken: token },
            { combinedToken: token },
          ],
        }).lean();

        console.log("[ThirdPartyForm][GET] No active/valid form found for token", {
          token,
          hasRawMatch: !!rawMatch,
          rawMatchId: rawMatch?._id,
          isActive: rawMatch?.isActive,
          expiresAt: rawMatch?.expiresAt,
          status: rawMatch?.status,
        });

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

      // Submitted keys were sanitized (dots -> underscores) before storage,
      // but the fill page prefills by the original "sectionKey.fieldName"
      // keys. Map sanitized keys back to their template form so reopening the
      // link actually shows the previous answers. Unmatched keys pass through.
      const plainExistingData =
        existingData instanceof Map
          ? Object.fromEntries(existingData)
          : existingData && typeof existingData.toJSON === "function"
          ? existingData.toJSON()
          : { ...(existingData || {}) };
      const sanitizedToOriginalKey = {};
      (thirdPartyForm.formTemplateId?.formStructure || []).forEach(
        (section, sectionIndex) => {
          const sectionKey =
            section.section || section.unitCode || `section_${sectionIndex}`;
          (section.fields || []).forEach((f) => {
            if (!f?.fieldName) return;
            const fullKey = `${sectionKey}.${f.fieldName}`;
            sanitizedToOriginalKey[fullKey.replace(/\./g, "_")] = fullKey;
          });
        }
      );
      const restoredExistingData = {};
      for (const [key, value] of Object.entries(plainExistingData)) {
        restoredExistingData[sanitizedToOriginalKey[key] || key] = value;
      }
      existingData = restoredExistingData;

      // If the assessor sent this form back, surface their feedback and the
      // specific flagged questions so the third party sees what to redo when
      // they reopen their link (answers are already pre-filled below).
      let resubmission = null;
      try {
        const FormSubmission = require("../models/formSubmission");
        const linkedSubmission = await FormSubmission.findOne({
          applicationId: thirdPartyForm.applicationId?._id || thirdPartyForm.applicationId,
          formTemplateId: thirdPartyForm.formTemplateId?._id || thirdPartyForm.formTemplateId,
          filledBy: "third-party",
        }).select("resubmissionRequired resubmissionDeadline resubmissionFields assessorFeedback");

        if (linkedSubmission?.resubmissionRequired === true) {
          resubmission = {
            required: true,
            assessorFeedback: linkedSubmission.assessorFeedback || "",
            deadline: linkedSubmission.resubmissionDeadline || null,
            fields: (linkedSubmission.resubmissionFields || []).map((f) => ({
              fieldName: f.fieldName,
              label: f.label || "",
              note: f.note || "",
            })),
          };
        }
      } catch (lookupError) {
        // Best-effort: the form must still load even if the lookup fails.
        console.error("[ThirdPartyForm][GET] Resubmission lookup failed:", lookupError);
      }

      // Show all sections/fields but mark assessor-only sections and fields as read-only
      const processedStructure = (thirdPartyForm.formTemplateId?.formStructure || [])
        .map((section) => {
          // Check if the entire section is assessor-only
          const sectionIsAssessorOnly = isAssessorOnly(section);

          let mappedFields = section.fields;
          if (Array.isArray(section.fields)) {
            mappedFields = section.fields.map((field) => {
              // Field is assessor-only if:
              // 1. The section itself is assessor-only, OR
              // 2. The field itself is marked as assessor-only
              const fieldIsAssessorOnly = sectionIsAssessorOnly || isAssessorOnly(field);
              return {
                ...field,
                _isAssessorOnly: fieldIsAssessorOnly,
                _editable: !fieldIsAssessorOnly, // third party cannot edit assessor-only fields
                _readOnly: !!fieldIsAssessorOnly,
                _parentSectionIsAssessorOnly: sectionIsAssessorOnly, // Track if parent section is assessor-only
              };
            });
          }

          return {
            ...section,
            fields: mappedFields,
            // Mark section as assessor-only and read-only if it's assessor-only
            _isAssessorOnly: sectionIsAssessorOnly,
            _editable: !sectionIsAssessorOnly, // third party cannot edit assessor-only sections
            _readOnly: !!sectionIsAssessorOnly,
          };
        });

      res.json({
        success: true,
        data: {
          formTemplate: {
            ...(thirdPartyForm.formTemplateId?.toObject
              ? thirdPartyForm.formTemplateId.toObject()
              : thirdPartyForm.formTemplateId),
            formStructure: processedStructure,
          },
          student: thirdPartyForm.userId,
          accessType,
          employerName: thirdPartyForm.employerName,
          referenceName: thirdPartyForm.referenceName,
          existingData,
          lastSavedAt:
            accessType === "combined"
              ? thirdPartyForm.combinedSubmission?.lastSavedAt || null
              : accessType === "employer"
              ? thirdPartyForm.employerSubmission?.lastSavedAt || null
              : thirdPartyForm.referenceSubmission?.lastSavedAt || null,
          expiresAt: thirdPartyForm.expiresAt,
          isSameEmail: thirdPartyForm.isSameEmail,
          resubmission,
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

  /**
   * Save progress without submitting.
   *
   * Third-party forms are long, and the employer or referee filling one in has
   * no account to come back to — only the emailed link. Draft answers are
   * stored on the same submission block the final answers use, so reopening
   * the link restores them through the existing prefill path.
   */
  saveThirdPartyDraft: async (req, res) => {
    try {
      const { token } = req.params;
      const { formData } = req.body;

      if (!formData || typeof formData !== "object") {
        return res
          .status(400)
          .json({ success: false, message: "No form data to save" });
      }

      const thirdPartyForm = await ThirdPartyFormSubmission.findOne({
        $or: [
          { employerToken: token },
          { referenceToken: token },
          { combinedToken: token },
        ],
        $and: [
          { $or: [{ isActive: true }, { isActive: { $exists: false } }] },
          {
            $or: [
              { expiresAt: { $gt: new Date() } },
              { expiresAt: { $exists: false } },
            ],
          },
        ],
      });

      if (!thirdPartyForm) {
        return res
          .status(404)
          .json({ success: false, message: "Form not found or expired" });
      }

      // Which party is this link for?
      let key = null;
      if (thirdPartyForm.combinedToken === token) key = "combinedSubmission";
      else if (thirdPartyForm.employerToken === token) key = "employerSubmission";
      else if (thirdPartyForm.referenceToken === token) key = "referenceSubmission";

      if (!key) {
        return res
          .status(404)
          .json({ success: false, message: "Form not found or expired" });
      }

      // Once a party has submitted, their answers are final until an assessor
      // reopens the form. Saving then would silently overwrite a submission.
      if (thirdPartyForm[key]?.isSubmitted) {
        return res.status(400).json({
          success: false,
          message: "This form has already been submitted and can no longer be edited",
        });
      }

      const savedAt = new Date();
      // Same sanitisation the submit path uses, so a draft and a submission
      // are stored identically and restore through the same code.
      thirdPartyForm[key] = {
        ...(thirdPartyForm[key]?.toObject?.() || thirdPartyForm[key] || {}),
        formData: sanitizeFormDataKeys(formData),
        isSubmitted: false,
        lastSavedAt: savedAt,
      };

      await thirdPartyForm.save();

      res.json({
        success: true,
        message: "Progress saved",
        data: { savedAt, accessType: key.replace("Submission", "") },
      });
    } catch (error) {
      console.error("Save third-party draft error:", error);
      res
        .status(500)
        .json({ success: false, message: "Could not save your progress" });
    }
  },

  // Submit third-party form
  submitThirdPartyForm: async (req, res) => {
    try {
      const { token } = req.params;
      const { formData } = req.body;
      const ipAddress = req.ip;
      const userAgent = req.get("User-Agent");

      console.log("[ThirdPartyForm][SUBMIT] Incoming submission", {
        token,
        url: req.originalUrl,
        ip: ipAddress,
        userAgent,
        hasFormData: !!formData,
        time: new Date().toISOString(),
      });

      const thirdPartyForm = await ThirdPartyFormSubmission.findOne({
        $or: [
          { employerToken: token },
          { referenceToken: token },
          { combinedToken: token },
        ],
        // Backwards compatible: older records may not have these fields set
        $and: [
          { $or: [{ isActive: true }, { isActive: { $exists: false } }] },
          { $or: [{ expiresAt: { $gt: new Date() } }, { expiresAt: { $exists: false } }] },
        ],
      });

      if (!thirdPartyForm) {
        const rawMatch = await ThirdPartyFormSubmission.findOne({
          $or: [
            { employerToken: token },
            { referenceToken: token },
            { combinedToken: token },
          ],
        }).lean();

        console.log("[ThirdPartyForm][SUBMIT] No active/valid form found for token", {
          token,
          hasRawMatch: !!rawMatch,
          rawMatchId: rawMatch?._id,
          isActive: rawMatch?.isActive,
          expiresAt: rawMatch?.expiresAt,
          status: rawMatch?.status,
        });

        return res.status(404).json({
          success: false,
          message: "Form not found or expired",
        });
      }

      // Sanitize formData keys before saving
      const sanitizedFormData = sanitizeFormDataKeys(formData);

      // Validate assessor-only fields (prevent third-party users from submitting assessor-only fields)
      const formTemplate = await FormTemplate.findById(thirdPartyForm.formTemplateId);
      if (formTemplate && formTemplate.formStructure) {
        const assessorOnlyValidation = validateAssessorOnlyFields(
          sanitizedFormData,
          formTemplate.formStructure,
          'third-party' // Third-party users are not assessors
        );
        if (!assessorOnlyValidation.isValid) {
          return res.status(403).json({
            success: false,
            message: "You cannot submit assessor-only fields. These sections are reserved for assessors only.",
            errors: assessorOnlyValidation.errors,
          });
        }
      }

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

  // Public access for verifier form
  getVerifierForm: async (req, res) => {
    try {
      const { token } = req.params;
      const tpr = await ThirdPartyFormSubmission.findOne({
        verifierToken: token,
        isActive: true,
        expiresAt: { $gt: new Date() },
      })
        .populate("verifierFormTemplateId")
        .populate("userId", "firstName lastName email")
        .populate({
          path: "applicationId",
          select: "certificationId",
          populate: {
            path: "certificationId",
            select: "name",
          },
        });

      if (!tpr || !tpr.verifierFormTemplateId) {
        return res.status(404).json({ success: false, message: "Verifier form not found or expired" });
      }

      res.json({
        success: true,
        data: {
          formTemplate: tpr.verifierFormTemplateId,
          student: tpr.userId,
          application: {
            id: String(tpr.applicationId?._id),
            certificationName: tpr.applicationId?.certificationId?.name,
          },
          existingData: tpr.verifierSubmission?.formData || {},
          verificationStatus: tpr.verificationStatus,
          expiresAt: tpr.expiresAt,
        },
      });
    } catch (error) {
      console.error("Get verifier form error:", error);
      res.status(500).json({ success: false, message: "Error fetching verifier form" });
    }
  },

  submitVerifierForm: async (req, res) => {
    try {
      const { token } = req.params;
      const { formData } = req.body;
      const ipAddress = req.ip;
      const userAgent = req.get("User-Agent");

      const tpr = await ThirdPartyFormSubmission.findOne({
        verifierToken: token,
        isActive: true,
        expiresAt: { $gt: new Date() },
      });

      if (!tpr) {
        return res.status(404).json({ success: false, message: "Verifier form not found or expired" });
      }

      const sanitizedData = sanitizeFormDataKeys(formData || {});
      tpr.verifierSubmission = {
        formData: sanitizedData,
        submittedAt: new Date(),
        ipAddress,
        userAgent,
        isSubmitted: true,
      };

      tpr.verification.verifier = tpr.verification.verifier || {};
      tpr.verification.verifier.status = "verified";
      tpr.verification.verifier.verifiedAt = new Date();
      tpr.verification.verifier.responseContent = "";
      tpr.verificationStatus = calculateVerificationAggregate(tpr);

      // The verifier form is an independent verification record. It must NOT
      // complete the third-party step on its own — step completion is driven
      // solely by employer/reference/combined submissions. Verification can
      // happen before or after the third-party form itself is completed.
      tpr.markModified("verification");

      await tpr.save();

      res.json({
        success: true,
        message: "Verification recorded",
        data: {
          verificationStatus: tpr.verificationStatus,
        },
      });
    } catch (error) {
      console.error("Submit verifier form error:", error);
      res.status(500).json({ success: false, message: "Error submitting verifier form" });
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
          employerEmail: thirdPartyForm.employerEmail,
          referenceName: thirdPartyForm.referenceName,
          referenceEmail: thirdPartyForm.referenceEmail,
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

  // Admin/assessor: get the secure third-party links so they can be copied
  // and sent manually (e.g. when the automated email did not reach the
  // recipient). Extends expiry so a copied link is valid for at least 30 days.
  getThirdPartyFormLinks: async (req, res) => {
    try {
      const { applicationId, formTemplateId } = req.params;

      const thirdPartyForm = await ThirdPartyFormSubmission.findOne({
        applicationId,
        formTemplateId,
      });

      if (!thirdPartyForm) {
        return res.status(404).json({
          success: false,
          message: "Third-party form not found for this application",
        });
      }

      const minExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      if (!thirdPartyForm.expiresAt || thirdPartyForm.expiresAt < minExpiry) {
        thirdPartyForm.expiresAt = minExpiry;
      }
      if (thirdPartyForm.isActive === false) {
        thirdPartyForm.isActive = true;
      }
      await thirdPartyForm.save();

      const buildUrl = (token) =>
        `${process.env.FRONTEND_URL}/thirdpartyform/${token}`;

      const links =
        thirdPartyForm.isSameEmail && thirdPartyForm.combinedToken
          ? [
              {
                role: "Employer & Professional Reference",
                name:
                  thirdPartyForm.employerName || thirdPartyForm.referenceName,
                email: thirdPartyForm.employerEmail,
                url: buildUrl(thirdPartyForm.combinedToken),
                isSubmitted:
                  thirdPartyForm.combinedSubmission?.isSubmitted === true,
              },
            ]
          : [
              {
                role: "Employer Reference",
                name: thirdPartyForm.employerName,
                email: thirdPartyForm.employerEmail,
                url: buildUrl(thirdPartyForm.employerToken),
                isSubmitted:
                  thirdPartyForm.employerSubmission?.isSubmitted === true,
              },
              {
                role: "Professional Reference",
                name: thirdPartyForm.referenceName,
                email: thirdPartyForm.referenceEmail,
                url: buildUrl(thirdPartyForm.referenceToken),
                isSubmitted:
                  thirdPartyForm.referenceSubmission?.isSubmitted === true,
              },
            ];

      res.json({
        success: true,
        data: {
          links,
          status: thirdPartyForm.status,
          expiresAt: thirdPartyForm.expiresAt,
        },
      });
    } catch (error) {
      console.error("Get third-party form links error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching third-party form links",
      });
    }
  },

  // Resend emails
  resendThirdPartyEmails: async (req, res) => {
    try {
      const { applicationId, formTemplateId } = req.params;
      const userId = req.user.id;
      const {
        employerName,
        employerEmail,
        referenceName,
        referenceEmail,
      } = req.body || {};

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

      const hasContactUpdates =
        typeof employerName === "string" ||
        typeof employerEmail === "string" ||
        typeof referenceName === "string" ||
        typeof referenceEmail === "string";

      if (hasContactUpdates) {
        const nextEmployerName =
          typeof employerName === "string"
            ? employerName.trim()
            : thirdPartyForm.employerName;
        const nextReferenceName =
          typeof referenceName === "string"
            ? referenceName.trim()
            : thirdPartyForm.referenceName;
        const nextEmployerEmail =
          typeof employerEmail === "string"
            ? employerEmail.trim().toLowerCase()
            : thirdPartyForm.employerEmail;
        const nextReferenceEmail =
          typeof referenceEmail === "string"
            ? referenceEmail.trim().toLowerCase()
            : thirdPartyForm.referenceEmail;

        if (!nextEmployerName) {
          return res.status(400).json({
            success: false,
            message: "Employer name is required",
          });
        }
        if (!nextReferenceName) {
          return res.status(400).json({
            success: false,
            message: "Reference name is required",
          });
        }
        if (!isValidEmail(nextEmployerEmail)) {
          return res.status(400).json({
            success: false,
            message: "A valid employer email is required",
          });
        }
        if (!isValidEmail(nextReferenceEmail)) {
          return res.status(400).json({
            success: false,
            message: "A valid reference email is required",
          });
        }

        const oldEmployerEmail = (thirdPartyForm.employerEmail || "").toLowerCase();
        const oldReferenceEmail = (thirdPartyForm.referenceEmail || "").toLowerCase();
        const oldIsSameEmail = !!oldEmployerEmail && oldEmployerEmail === oldReferenceEmail;
        const newIsSameEmail = nextEmployerEmail === nextReferenceEmail;
        const recipientChanged =
          oldEmployerEmail !== nextEmployerEmail ||
          oldReferenceEmail !== nextReferenceEmail ||
          oldIsSameEmail !== newIsSameEmail;

        thirdPartyForm.employerName = nextEmployerName;
        thirdPartyForm.referenceName = nextReferenceName;
        thirdPartyForm.employerEmail = nextEmployerEmail;
        thirdPartyForm.referenceEmail = nextReferenceEmail;

        if (recipientChanged) {
          // Regenerate access tokens so old links cannot be reused after changing recipients.
          thirdPartyForm.employerToken = crypto.randomBytes(32).toString("hex");
          thirdPartyForm.referenceToken = crypto.randomBytes(32).toString("hex");
          thirdPartyForm.combinedToken = newIsSameEmail
            ? crypto.randomBytes(32).toString("hex")
            : undefined;

          // Require fresh submission for updated recipients.
          thirdPartyForm.employerSubmission = { formData: {}, isSubmitted: false };
          thirdPartyForm.referenceSubmission = { formData: {}, isSubmitted: false };
          thirdPartyForm.combinedSubmission = { formData: {}, isSubmitted: false };
          thirdPartyForm.status = "pending";
        }
      }

      const user = await User.findById(userId);

      // Resent emails reuse the existing secure links — extend expiry so the
      // links stay valid for at least another 30 days from this resend.
      const minExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      if (!thirdPartyForm.expiresAt || thirdPartyForm.expiresAt < minExpiry) {
        thirdPartyForm.expiresAt = minExpiry;
      }

      if (thirdPartyForm.isSameEmail) {
        await sendCombinedEmail(
          thirdPartyForm,
          thirdPartyForm.formTemplateId,
          user
        );
        thirdPartyForm.combinedEmailSent = true;
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
        thirdPartyForm.employerEmailSent = true;
        thirdPartyForm.referenceEmailSent = true;
      }

      await thirdPartyForm.save();

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
      const rtoName = process.env.RTO_NAME || "Certified Australia";
      const rtoCode = process.env.RTO_CODE || "RTO NUMBER";
      const rtoNumber = `${rtoName} ${rtoCode}`;

      // Only send verification to employer (never to reference) in this branch
      const toSend = ['employer'];
      const updates = {};

      // Verification emails carry links tied to this record — extend expiry so
      // they stay valid for at least another 30 days from this send.
      const minVerificationExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      if (!tpr.expiresAt || tpr.expiresAt < minVerificationExpiry) {
        updates.expiresAt = minVerificationExpiry;
      }

      const verifierFormTemplate = await FormTemplate.findOne({
        filledBy: 'third-party-verifier',
        isActive: true,
      }).sort({ updatedAt: -1 });
      if (!verifierFormTemplate) {
        return res.status(400).json({ success: false, message: "Verifier form template not found" });
      }

      const verifierToken = crypto.randomBytes(32).toString('hex');
      const verifierUrl = `${process.env.FRONTEND_URL}/thirdparty-verifier/${verifierToken}`;

      updates.verifierFormTemplateId = verifierFormTemplate._id;
      updates.verifierToken = verifierToken;
      updates['verification.verifier.token'] = verifierToken;
      updates['verification.verifier.sentAt'] = new Date();
      updates['verification.verifier.status'] = 'pending';
      updates['verification.verifier.verifiedAt'] = null;
      updates['verification.verifier.responseContent'] = '';
      updates.verifierSubmission = {
        formData: {},
        submittedAt: null,
        ipAddress: '',
        userAgent: '',
        isSubmitted: false,
      };
      updates['verification.verifier.lastSentSubject'] = 'Employment Verification Request';
      updates['verification.verifier.lastSentContent'] = '';

      // Use a single 6-digit short code across employer/reference (and combined)
      // Store it at verification.shortCode
      const existingShort = tpr.verification?.shortCode;
      const sharedShortCode = existingShort || String(Math.floor(100000 + Math.random() * 900000));

      for (const t of toSend) {
        let recipientEmail, recipientName;
        if (t === 'employer') { recipientEmail = tpr.employerEmail; recipientName = tpr.employerName; }
        if (t === 'reference') { recipientEmail = tpr.referenceEmail; recipientName = tpr.referenceName; }
        const token = crypto.randomBytes(24).toString('hex');
        updates[`verification.${t}.token`] = token;
        updates[`verification.shortCode`] = sharedShortCode;
        updates[`verification.${t}.sentAt`] = new Date();
        updates[`verification.${t}.status`] = 'pending';

        const { subject, html, messageId } = await emailService.sendTPRVerificationEmail(recipientEmail, {
          recipientName, studentName, qualificationName, rtoNumber, token, shortCode: sharedShortCode, formUrl: verifierUrl
        });
        updates[`verification.${t}.lastSentSubject`] = subject || 'Employer Verification Request';
        updates[`verification.${t}.lastSentContent`] = html || '';
        if (messageId) updates[`verification.${t}.lastSentMessageId`] = messageId;
      }

      // Nothing else to do; shared code is in verification.shortCode

      // Aggregate top-level status
      updates.verificationStatus = 'pending';
      await ThirdPartyFormSubmission.findByIdAndUpdate(tpr._id, { $set: updates });

      // Echo back the shared reference code for diagnostics
      const sharedShortCodeEcho = updates['verification.shortCode'];
      if (sharedShortCodeEcho) {
        console.log(`[TPR] Sent verification for application=${String(tpr.applicationId)} tprId=${String(tpr._id)} sharedRefCode=${sharedShortCodeEcho}`);
      }

      return res.json({ success: true, message: 'Verification email(s) sent', tprId: String(tpr._id), refCode: sharedShortCodeEcho });
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
      const aggregate = calculateVerificationAggregate(updated);
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
      const aggregate = calculateVerificationAggregate(updated);
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

    // Update with new data while preserving assessor sections
    const preservedAssessorData = existingSubmission.assessorFormData || {};
    existingSubmission.formData = {
      ...combinedFormData,
      ...preservedAssessorData,
    };
    existingSubmission.status = "submitted";
    existingSubmission.submittedAt = new Date();
    existingSubmission.assessedBy = undefined;
    existingSubmission.assessedAt = undefined;
    existingSubmission.assessmentNotes = undefined;
    existingSubmission.assessorFeedback = undefined;
    existingSubmission.resubmissionRequired = false; // ALWAYS clear this flag
    existingSubmission.resubmissionFields = [];
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
      assessorFormData: {},
      assessorStatus: "draft",
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

function calculateVerificationAggregate(doc) {
  const statuses = [
    doc.verification?.employer?.status,
    doc.verification?.reference?.status,
    doc.isSameEmail ? doc.verification?.combined?.status : undefined,
    doc.verification?.verifier?.status,
  ].filter(Boolean);

  if (statuses.some(s => s === "verified")) return "verified";
  if (statuses.some(s => s === "rejected")) return "rejected";
  if (statuses.length && statuses.every(s => s === "not_sent")) return "none";
  return "pending";
}

module.exports = thirdPartyFormController;
