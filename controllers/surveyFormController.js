const FormSubmission = require("../models/formSubmission");
const surveyFormService = require("../services/surveyFormService");
const formSubmissionController = require("./formSubmissionController");

const surveyFormController = {
  getSurveyForm: async (req, res) => {
    try {
      const { token } = req.params;
      const request = await surveyFormService.getActiveSurveyRequestByToken(token);

      if (!request) {
        return res.status(404).json({
          success: false,
          message: "Survey form not found or expired",
        });
      }

      const formTemplate = request.formTemplateId;

      res.json({
        success: true,
        data: {
          token: request.token,
          expiresAt: request.expiresAt,
          applicationId: request.applicationId?._id || request.applicationId,
          user: request.userId,
          formTemplate: formTemplate
            ? {
                id: formTemplate._id,
                name: formTemplate.name,
                description: formTemplate.description,
                stepNumber: formTemplate.stepNumber,
                filledBy: formTemplate.filledBy,
                formStructure: formTemplate.formStructure,
              }
            : null,
          status: request.status,
        },
      });
    } catch (error) {
      console.error("Get survey form error:", error);
      res.status(500).json({
        success: false,
        message: "Error retrieving survey form",
      });
    }
  },

  submitSurveyForm: async (req, res) => {
    try {
      const { token } = req.params;
      const { formData } = req.body;

      if (!formData) {
        return res.status(400).json({
          success: false,
          message: "Form data is required",
        });
      }

      const request = await surveyFormService.getActiveSurveyRequestByToken(token);

      if (!request) {
        return res.status(404).json({
          success: false,
          message: "Survey form not found or expired",
        });
      }

      const formTemplate = request.formTemplateId;

      if (!formTemplate) {
        return res.status(400).json({
          success: false,
          message: "Form template is no longer available",
        });
      }

      const validation = formSubmissionController.validateFormData(
        formData,
        formTemplate.formStructure || []
      );

      if (!validation.isValid) {
        return res.status(400).json({
          success: false,
          message: "Form validation failed",
          errors: validation.errors,
        });
      }

      const applicationId = request.applicationId?._id || request.applicationId;
      const userId = request.userId?._id || request.userId;

      if (!applicationId) {
        return res.status(400).json({
          success: false,
          message: "Application context missing for this survey",
        });
      }

      let submission = await FormSubmission.findOne({
        applicationId,
        formTemplateId: formTemplate._id,
        userId,
        filledBy: "survey-user",
      });

      if (submission) {
        submission.formData = formData;
        submission.status = "assessed";
        submission.assessed = "approved";
        submission.assessedAt = new Date();
        submission.resubmissionRequired = false;
        submission.submittedAt = new Date();
        await submission.save();
      } else {
        submission = await FormSubmission.create({
          applicationId,
          formTemplateId: formTemplate._id,
          userId,
          stepNumber: formTemplate.stepNumber,
          filledBy: "survey-user",
          formData,
          status: "assessed",
          assessed: "approved",
          assessedAt: new Date(),
          resubmissionRequired: false,
          submittedAt: new Date(),
        });
      }

      await surveyFormService.markRequestCompleted(request, submission._id);

      try {
        await formSubmissionController.updateApplicationProgress(applicationId);
      } catch (progressErr) {
        console.error(
          "Unable to update application progress after survey:",
          progressErr
        );
      }

      res.json({
        success: true,
        message: "Survey submitted successfully",
        data: {
          submissionId: submission._id,
          status: submission.status,
          submittedAt: submission.submittedAt,
        },
      });
    } catch (error) {
      console.error("Submit survey form error:", error);
      res.status(500).json({
        success: false,
        message: "Error submitting survey form",
      });
    }
  },
};

module.exports = surveyFormController;

