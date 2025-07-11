// controllers/formSubmissionController.js
const FormSubmission = require("../models/formSubmission");
const Application = require("../models/application");
const FormTemplate = require("../models/formTemplate");
const Certification = require("../models/certification");
const EmailHelpers = require("../utils/emailHelpers");


const formSubmissionController = {
  // Get forms for a specific application (what forms need to be filled)
  getApplicationForms: async (req, res) => {
    try {
      const { applicationId } = req.params;
      const userId = req.user.id;

      // Get the application with certification and form templates
      const application = await Application.findOne({
        _id: applicationId,
        userId: userId,
      }).populate({
        path: "certificationId",
        populate: {
          path: "formTemplateIds.formTemplateId",
        },
      });

      if (!application) {
        return res.status(404).json({
          success: false,
          message: "Application not found",
        });
      }

      // Get existing form submissions for this application
      const existingSubmissions = await FormSubmission.find({
        applicationId: applicationId,
        userId: userId,
      });

      // Create a map of existing submissions
      const submissionMap = new Map();
      existingSubmissions.forEach((submission) => {
        submissionMap.set(submission.formTemplateId.toString(), submission);
      });

      // Prepare forms with their submission status
      const forms = application.certificationId.formTemplateIds.map(
        (formTemplate) => {
          const existingSubmission = submissionMap.get(
            formTemplate.formTemplateId._id.toString()
          );

          return {
            formTemplate: formTemplate.formTemplateId,
            stepNumber: formTemplate.stepNumber,
            isRequired: formTemplate.isRequired,
            submission: existingSubmission
              ? {
                  id: existingSubmission._id,
                  status: existingSubmission.status,
                  submittedAt: existingSubmission.submittedAt,
                  lastModified: existingSubmission.updatedAt,
                }
              : null,
            canFill: formSubmissionController.canUserFillForm(
              formTemplate.formTemplateId,
              req.user.userType
            ),
          };
        }
      );

      // Sort by step number
      forms.sort((a, b) => a.stepNumber - b.stepNumber);

      res.status(200).json({
        success: true,
        data: {
          application: {
            id: application._id,
            overallStatus: application.overallStatus,
            currentStep: application.currentStep,
          },
          certification: {
            id: application.certificationId._id,
            name: application.certificationId.name,
          },
          forms: forms,
        },
      });
    } catch (error) {
      console.error("Get application forms error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching application forms",
        error: error.message,
      });
    }
  },

  // Get a specific form template for filling
  getFormForFilling: async (req, res) => {
    try {
      const { applicationId, formTemplateId } = req.params;
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

      // Get form template
      const formTemplate = await FormTemplate.findById(formTemplateId);
      if (!formTemplate) {
        return res.status(404).json({
          success: false,
          message: "Form template not found",
        });
      }

      // Check if user can fill this form
      if (
        !formSubmissionController.canUserFillForm(
          formTemplate,
          req.user.userType
        )
      ) {
        return res.status(403).json({
          success: false,
          message: "You are not authorized to fill this form",
        });
      }

      // Get existing submission if any
      const existingSubmission = await FormSubmission.findOne({
        applicationId,
        formTemplateId,
        userId,
      });

      res.status(200).json({
        success: true,
        data: {
          formTemplate: {
            id: formTemplate._id,
            name: formTemplate.name,
            description: formTemplate.description,
            stepNumber: formTemplate.stepNumber,
            filledBy: formTemplate.filledBy,
            formStructure: formTemplate.formStructure,
          },
          existingSubmission: existingSubmission
            ? {
                id: existingSubmission._id,
                formData: existingSubmission.formData,
                status: existingSubmission.status,
                submittedAt: existingSubmission.submittedAt,
                lastModified: existingSubmission.updatedAt,
              }
            : null,
        },
      });
    } catch (error) {
      console.error("Get form for filling error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching form for filling",
        error: error.message,
      });
    }
  },

  // Add after getUserFormSubmissions method
  resubmitForm: async (req, res) => {
    try {
      const { submissionId } = req.params;
      const { formData } = req.body;
      const userId = req.user.id;

      const submission = await FormSubmission.findOne({
        _id: submissionId,
        userId: userId,
      });

      if (!submission) {
        return res.status(404).json({
          success: false,
          message: "Form submission not found",
        });
      }

      if (!submission.resubmissionRequired) {
        return res.status(400).json({
          success: false,
          message: "This form does not require resubmission",
        });
      }

      if (
        submission.resubmissionDeadline &&
        new Date() > submission.resubmissionDeadline
      ) {
        return res.status(400).json({
          success: false,
          message: "Resubmission deadline has passed",
        });
      }

      // Validate form data
      const formTemplate = await FormTemplate.findById(
        submission.formTemplateId
      );
      const validationResult = formSubmissionController.validateFormData(
        formData,
        formTemplate.formStructure
      );
      if (!validationResult.isValid) {
        return res.status(400).json({
          success: false,
          message: "Form data validation failed",
          errors: validationResult.errors,
        });
      }

      // Update submission with new data
      submission.formData = formData;
      submission.version += 1;
      submission.status = "submitted";
      submission.submittedAt = new Date();
      submission.assessmentStatus = "pending";
      submission.resubmissionRequired = false;
      submission.assessedBy = undefined;
      submission.assessedAt = undefined;
      submission.assessmentNotes = undefined;
      submission.assessorFeedback = undefined;

      await submission.save();

      res.json({
        success: true,
        message: "Form resubmitted successfully",
        data: {
          submission: {
            id: submission._id,
            version: submission.version,
            status: submission.status,
            submittedAt: submission.submittedAt,
          },
        },
      });
    } catch (error) {
      console.error("Resubmit form error:", error);
      res.status(500).json({
        success: false,
        message: "Error resubmitting form",
      });
    }
  },

  // Add method to get forms requiring resubmission
  getResubmissionRequiredForms: async (req, res) => {
    try {
      const userId = req.user.id;
      const { applicationId } = req.params;

      const submissions = await FormSubmission.find({
        userId: userId,
        applicationId: applicationId,
        resubmissionRequired: true,
      })
        .populate("formTemplateId", "name description stepNumber")
        .sort({ resubmissionDeadline: 1 });

      res.json({
        success: true,
        data: submissions.map((sub) => ({
          id: sub._id,
          formTemplate: sub.formTemplateId,
          assessorFeedback: sub.assessorFeedback,
          resubmissionDeadline: sub.resubmissionDeadline,
          version: sub.version,
        })),
      });
    } catch (error) {
      console.error("Get resubmission required forms error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching forms requiring resubmission",
      });
    }
  },

  // Submit or update a form
  submitForm: async (req, res) => {
    try {
      const { applicationId, formTemplateId } = req.params;
      const { formData, status = "submitted" } = req.body;
      const userId = req.user.id;

      // Verify application belongs to user
      const application = await Application.findOne({
        _id: applicationId,
      });

      if (!application) {
        return res.status(404).json({
          success: false,
          message: "Application not found",
        });
      }

      // Get form template to validate
      const formTemplate = await FormTemplate.findById(formTemplateId);
      if (!formTemplate) {
        return res.status(404).json({
          success: false,
          message: "Form template not found",
        });
      }

      // Check if user can fill this form

      if (
        !formSubmissionController.canUserFillForm(
          formTemplate,
          req.user.userType
        )
      ) {
        return res.status(403).json({
          success: false,
          message: "You are not authorized to fill this form",
        });
      }
      // Validate form data against template structure
      const validationResult = formSubmissionController.validateFormData(
        formData,
        formTemplate.formStructure
      );
      if (!validationResult.isValid) {
        return res.status(400).json({
          success: false,
          message: "Form data validation failed",
          errors: validationResult.errors,
        });
      }

      // Check if submission already exists
      let formSubmission = await FormSubmission.findOne({
        applicationId,
        formTemplateId,
        userId,
      });

      if (formSubmission) {
        // Update existing submission
        formSubmission.formData = formData;
        formSubmission.status = status;
        if (status === "submitted") {
          formSubmission.submittedAt = new Date();
        }
        await formSubmission.save();
      } else {
        // Create new submission
        formSubmission = await FormSubmission.create({
          applicationId,
          formTemplateId,
          userId,
          stepNumber: formTemplate.stepNumber,
          filledBy: formTemplate.filledBy,
          formData,
          status,
          submittedAt: status === "submitted" ? new Date() : null,
        });
      }

      // Update application progress if form was submitted
      if (status === "submitted") {
        await formSubmissionController.updateApplicationProgress(applicationId);
      }

      if (status === "submitted") {
        // Send form submission confirmation
        const user = await User.findById(userId);
        const application = await Application.findById(applicationId);
        const formTemplate = await FormTemplate.findById(formTemplateId);

        await EmailHelpers.handleFormSubmitted(
          user,
          application,
          formTemplate.name
        );
      }

      res.status(200).json({
        success: true,
        message:
          status === "submitted"
            ? "Form submitted successfully"
            : "Form saved as draft",
        data: {
          submission: {
            id: formSubmission._id,
            status: formSubmission.status,
            submittedAt: formSubmission.submittedAt,
            lastModified: formSubmission.updatedAt,
          },
        },
      });
    } catch (error) {
      console.error("Submit form error:", error);
      res.status(500).json({
        success: false,
        message: "Error submitting form",
        error: error.message,
      });
    }
  },

  // Get user's form submissions for an application
  getUserFormSubmissions: async (req, res) => {
    try {
      const { applicationId } = req.params;
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

      const submissions = await FormSubmission.find({
        applicationId,
        userId,
      }).populate("formTemplateId", "name description stepNumber filledBy");

      res.status(200).json({
        success: true,
        data: submissions,
      });
    } catch (error) {
      console.error("Get user form submissions error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching form submissions",
        error: error.message,
      });
    }
  },

  // Helper method to check if user can fill a form
  canUserFillForm: (formTemplate, userType) => {
    if (userType === "admin") return true;

    if (userType === "assessor") {
      return (
        formTemplate.filledBy === "assessor" || formTemplate.filledBy === "both"
      );
    }

    return formTemplate.filledBy === "user" || formTemplate.filledBy === "both";
  },

  // Helper method to validate form data
  validateFormData: (formData, formStructure) => {
    const errors = [];

    // Basic validation - check required fields
    formStructure.forEach((field) => {
      if (
        field.required &&
        (!formData[field.fieldName] || formData[field.fieldName] === "")
      ) {
        errors.push(`${field.label} is required`);
      }

      // Add more validation based on field type
      if (field.fieldType === "email" && formData[field.fieldName]) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(formData[field.fieldName])) {
          errors.push(`${field.label} must be a valid email`);
        }
      }

      if (field.fieldType === "number" && formData[field.fieldName]) {
        if (isNaN(formData[field.fieldName])) {
          errors.push(`${field.label} must be a number`);
        }
      }
    });

    return {
      isValid: errors.length === 0,
      errors: errors,
    };
  },

  // Helper method to update application progress
  updateApplicationProgress: async (applicationId) => {
    try {
      const application = await Application.findById(applicationId).populate({
        path: "certificationId",
        populate: {
          path: "formTemplateIds.formTemplateId",
        },
      });

      if (!application) return;

      // Get all form submissions for this application
      const submissions = await FormSubmission.find({
        applicationId: applicationId,
        status: "submitted",
      });

      // Get required forms
      const requiredForms = application.certificationId.formTemplateIds.filter(
        (ft) => ft.isRequired
      );

      // Check if all required forms are submitted
      const submittedFormIds = new Set(
        submissions.map((sub) => sub.formTemplateId.toString())
      );

      const allRequiredFormsSubmitted = requiredForms.every((rf) =>
        submittedFormIds.has(rf.formTemplateId._id.toString())
      );

      // Update application status based on progress
      let newStatus = application.overallStatus;
      let newStep = application.currentStep;

      if (allRequiredFormsSubmitted) {
        if (application.overallStatus === "in_progress") {
          newStatus = "under_review";
          newStep = Math.max(newStep, 3); // Move to review step
        }
      } else if (application.overallStatus === "payment_pending") {
        newStatus = "in_progress";
        newStep = 2; // Move to forms step
      }

      // Update application if status changed
      if (
        newStatus !== application.overallStatus ||
        newStep !== application.currentStep
      ) {
        await Application.findByIdAndUpdate(applicationId, {
          overallStatus: newStatus,
          currentStep: newStep,
        });
      }
    } catch (error) {
      console.error("Update application progress error:", error);
    }
  },

  getSubmissionById: async (req, res) => {
    try {
      const { id } = req.params;
      const submission = await FormSubmission.findById(id).populate(
        "formTemplateId"
      );

      if (!submission) {
        return res.status(404).json({
          success: false,
          message: "Form submission not found",
        });
      }

      res.json({
        success: true,
        data: submission,
      });
    } catch (error) {
      console.error("Get form submission by ID error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching form submission",
        error: error.message,
      });
    }
  },
};

module.exports = formSubmissionController;
