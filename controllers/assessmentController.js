// controllers/assessmentController.js
const FormSubmission = require("../models/formSubmission");
const Application = require("../models/application");
const User = require("../models/user");
const emailService = require("../services/emailService2");

const assessmentController = {
  // Get all submissions pending assessment for an assessor
  getPendingAssessments: async (req, res) => {
    try {
      const assessorId = req.user.id;
      const { page = 1, limit = 10 } = req.query;

      const submissions = await FormSubmission.find({
        status: "submitted",
        assessed: "pending",
      })
        .populate("applicationId", "overallStatus currentStep")
        .populate("userId", "firstName lastName email")
        .populate("formTemplateId", "name description stepNumber")
        .limit(limit * 1)
        .skip((page - 1) * limit)
        .sort({ submittedAt: 1 });

      const total = await FormSubmission.countDocuments({
        status: "submitted",
        assessed: "pending",
      });

      res.json({
        success: true,
        data: {
          submissions,
          pagination: {
            current: parseInt(page),
            pages: Math.ceil(total / limit),
            total,
          },
        },
      });
    } catch (error) {
      console.error("Get pending assessments error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching pending assessments",
      });
    }
  },

  // In assessmentController.js - Update the assessFormSubmission function

  assessFormSubmission: async (req, res) => {
    try {
      const { submissionId } = req.params;
      const {
        assessmentStatus,
        assessed,
        assessorFeedback,
        resubmissionDeadline,
      } = req.body;

      console.log("Assessing form submission:", {
        submissionId,
        assessed,
        assessorFeedback,
        resubmissionDeadline,
        assessmentStatus,
      });

      const assessorId = req.user.id;

      const submission = await FormSubmission.findById(submissionId)
        .populate("applicationId")
        .populate("userId", "firstName lastName email")
        .populate("formTemplateId", "name");

      if (!submission) {
        return res.status(404).json({
          success: false,
          message: "Form submission not found",
        });
      }

      // Get assessor details
      const assessor = await User.findById(assessorId, "firstName lastName");

      // Update submission with proper status handling
      submission.assessedBy = assessorId;
      submission.assessedAt = new Date();
      submission.assessorFeedback = assessorFeedback;

      // Set both fields to ensure compatibility
      const finalStatus = assessmentStatus || assessed;
      submission.assessed = finalStatus;
      submission.assessmentStatus = finalStatus;
      submission.status = "assessed";

      if (assessmentStatus === "requires_changes") {
        submission.resubmissionRequired = true;
        submission.resubmissionDeadline = resubmissionDeadline;

        // Store current version before allowing resubmission
        submission.previousVersions.push({
          formData: submission.formData,
          submittedAt: submission.submittedAt,
          version: submission.version,
        });

        // Handle third-party forms reset
        if (submission.filledBy === "third-party") {
          const ThirdPartyFormSubmission = require("../models/thirdPartyFormSubmission");

          await ThirdPartyFormSubmission.updateOne(
            {
              applicationId: submission.applicationId,
              formTemplateId: submission.formTemplateId,
            },
            {
              $set: {
                status: "pending",
                "employerSubmission.isSubmitted": false,
                "referenceSubmission.isSubmitted": false,
                "combinedSubmission.isSubmitted": false,
              },
            }
          );
        }
      }

      await submission.save();

      // Update application steps after assessment
      try {
        const { updateApplicationStep } = require("../utils/stepCalculator");
        await updateApplicationStep(submission.applicationId);
        console.log(`Updated application steps after assessment for ${submission.applicationId}`);
      } catch (stepError) {
        console.error("Error updating application steps:", stepError);
      }

      // Send email notifications
      try {
        if (assessmentStatus === "requires_changes") {
          await emailService.sendFormResubmissionRequiredEmail(
            submission.userId,
            submission.applicationId,
            submission.formTemplateId.name,
            assessorFeedback
          );
          console.log(`Form resubmission email sent to ${submission.userId.email}`);
        } else if (assessmentStatus === "approved") {
          await emailService.sendFormApprovalEmail(
            submission.userId,
            submission.applicationId,
            submission.formTemplateId.name,
            assessor
          );
          console.log(`Form approval email sent to ${submission.userId.email}`);
        }
      } catch (emailError) {
        console.error("Error sending form assessment email:", emailError);
      }

      // Update application progress
      await assessmentController.updateApplicationAssessmentProgress(
        submission.applicationId
      );

      res.json({
        success: true,
        message: `Form submission ${finalStatus === "approved" ? "approved" : "marked for resubmission"
          }`,
        data: {
          submission: {
            id: submission._id,
            assessed: submission.assessed,
            assessmentStatus: submission.assessmentStatus,
            assessorFeedback: submission.assessorFeedback,
            resubmissionRequired: submission.resubmissionRequired,
            resubmissionDeadline: submission.resubmissionDeadline,
          },
        },
      });
    } catch (error) {
      console.error("Assess form submission error:", error);
      res.status(500).json({
        success: false,
        message: "Error assessing form submission",
      });
    }
  },

  // Helper method to update application progress after assessment
  updateApplicationAssessmentProgress: async (applicationId) => {
    try {
      const application = await Application.findById(applicationId).populate({
        path: "certificationId",
        populate: {
          path: "formTemplateIds.formTemplateId",
        },
      });

      if (!application) return;

      // Get all submissions for this application
      const submissions = await FormSubmission.find({
        applicationId: applicationId,
        status: "assessed",
      });

      // Check assessment status of all submissions
      const approvedSubmissions = submissions.filter(
        (sub) => sub.assessed === "approved"
      );
      const requiresChanges = submissions.filter(
        (sub) => sub.assessed === "requires_changes"
      );

      // Get required forms count
      const requiredFormsCount =
        application.certificationId.formTemplateIds.filter(
          (ft) => ft.isRequired
        ).length;

      let newStatus = application.overallStatus;

      if (requiresChanges.length > 0) {
        newStatus = "in_progress"; // Back to in progress due to required changes
      } else if (approvedSubmissions.length >= requiredFormsCount) {
        newStatus = "assessment_completed";
      }

      if (newStatus !== application.overallStatus) {
        await Application.findByIdAndUpdate(applicationId, {
          overallStatus: newStatus,
        });
      }
    } catch (error) {
      console.error("Update application assessment progress error:", error);
    }
  },
};

module.exports = assessmentController;
