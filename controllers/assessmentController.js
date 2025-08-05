// controllers/assessmentController.js
const FormSubmission = require("../models/formSubmission");
const logme = require("../utils/logger");
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
      logme.error("Get pending assessments error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching pending assessments",
      });
    }
  },

  assessFormSubmission: async (req, res) => {
    try {
      const { submissionId } = req.params;
      const { 
        assessed, 
        assessmentStatus, 
        assessorFeedback, 
        resubmissionDeadline,
        resubmissionRequired 
      } = req.body;
      const assessorId = req.user.id;
      
      // Handle both field names for backward compatibility
      const finalAssessed = assessed || assessmentStatus;

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

      // Update submission
      submission.assessedBy = assessorId;
      submission.assessedAt = new Date();
      submission.assessorFeedback = assessorFeedback;
      submission.assessed = finalAssessed;
      submission.status = "assessed";

      // Handle resubmission logic
      if (finalAssessed === "requires_changes" || resubmissionRequired === true) {
        submission.resubmissionRequired = true;
        submission.resubmissionDeadline = resubmissionDeadline;

        // Store current version before allowing resubmission
        submission.previousVersions.push({
          formData: submission.formData,
          submittedAt: submission.submittedAt,
          version: submission.version,
        });
      }

      await submission.save();

      // SEND EMAIL NOTIFICATION BASED ON ASSESSMENT STATUS - ADD THIS BLOCK
      try {
        if (finalAssessed === "requires_changes") {
          // Send resubmission required email
          await emailService.sendFormResubmissionRequiredEmail(
            submission.userId,
            submission.applicationId,
            submission.formTemplateId.name,
            assessorFeedback,
            req.rtoId // Pass the RTO ID for proper branding
          );
          
        } else if (finalAssessed === "approved") {
          // Send form approval confirmation
          await emailService.sendFormApprovalEmail(
            submission.userId,
            submission.applicationId,
            submission.formTemplateId.name,
            assessor,
            req.rtoId // Pass the RTO ID for proper branding
          );
          
        }
      } catch (emailError) {
        logme.error("Error sending form assessment email:", emailError);
        // Don't fail the main operation if email fails
      }

      // Update application progress
      await assessmentController.updateApplicationAssessmentProgress(
        submission.applicationId
      );

      res.json({
        success: true,
        message: `Form submission ${
          finalAssessed === "approved"
            ? "approved"
            : "marked for resubmission"
        }`,
        data: {
          submission: {
            id: submission._id,
            assessed: submission.assessed,
            assessorFeedback: submission.assessorFeedback,
            resubmissionRequired: submission.resubmissionRequired,
            resubmissionDeadline: submission.resubmissionDeadline,
          },
        },
      });
    } catch (error) {
      logme.error("Assess form submission error:", error);
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
      logme.error("Update application assessment progress error:", error);
    }
  },
};

module.exports = assessmentController;
