// controllers/adminApplicationController.js
const Application = require("../models/application");
const User = require("../models/user");
const FormSubmission = require("../models/formSubmission");
const FormTemplate = require("../models/formTemplate");
const ThirdPartyFormSubmission = require("../models/thirdPartyFormSubmission");
const llnScoringService = require("../utils/llnScoringService");

const adminApplicationController = {
  // Get all applications with filtering and pagination
  getAllApplications: async (req, res) => {
    try {
      try { require("../utils/tprEmailPoller").pollTPRInbox().catch(() => {}); } catch (_) {}
      const {
        page = 1,
        limit = 10,
        status,
        search,
        sortBy = "newest",
        assessor,
      } = req.query;

      // Build filter object
      const filter = { isArchived: { $ne: true } }; // Add this line to exclude archived
      if (status && status !== "all" && status !== "undefined") {
        filter.overallStatus = status;
      }

      if (assessor && assessor !== "all" && assessor !== "undefined") {
        filter.assignedAssessor = assessor;
      }

      // Build search query
      let searchFilter = {};
      if (search && search.trim() !== "" && search !== "undefined") {
        const users = await User.find({
          $or: [
            { firstName: { $regex: search, $options: "i" } },
            { lastName: { $regex: search, $options: "i" } },
            { email: { $regex: search, $options: "i" } },
            // Add full name search using $expr and $concat
            {
              $expr: {
                $regexMatch: {
                  input: { $concat: ["$firstName", " ", "$lastName"] },
                  regex: search,
                  options: "i"
                }
              }
            }
          ],
        }).select("_id");

        const userIds = users.map((user) => user._id);
        searchFilter = { userId: { $in: userIds } };
      }

      // Combine filters
      const finalFilter = { ...filter, ...searchFilter };

      // Build sort object
      let sortObject = {};
      switch (sortBy) {
        case "oldest":
          sortObject = { createdAt: 1 };
          break;
        case "progress":
          sortObject = { currentStep: -1 };
          break;
        default: // newest
          sortObject = { createdAt: -1 };
      }

      console.log("Final Filter:", finalFilter);
  
      // Get applications
      const applications = await Application.find(finalFilter)
        .populate("userId", "firstName lastName email")
        .populate("certificationId", "name price")
        .populate("assignedAssessor", "firstName lastName")
        .populate("paymentId", "status")
        .populate("documentUploadId", "status")
        .limit(limit * 1)
        .skip((page - 1) * limit)
        .sort(sortObject);

      // Get total count
      const total = await Application.countDocuments(finalFilter);

      // Attach student-visible step summaries to each application (student + third-party only)
      const { calculateApplicationSteps } = require("../utils/stepCalculator");
      const applicationsWithSteps = await Promise.all(
        applications.map(async (app) => {
          let stepsSummary = null;
          try {
            const stepData = await calculateApplicationSteps(app._id);
            const studentSteps = (stepData.steps || []).filter(
              (s) => s.isUserVisible === true || s.actor === "student" || s.actor === "third_party"
            );
            const totalSteps = studentSteps.length;
            const completedSteps = studentSteps.filter((s) => s.isCompleted).length;
            const firstIncomplete = studentSteps.find((s) => !s.isCompleted);
            const currentStep = firstIncomplete
              ? firstIncomplete.stepNumber
              : (studentSteps[studentSteps.length - 1]?.stepNumber || 0);
            const progressPercentage = totalSteps > 0
              ? Math.round((completedSteps / totalSteps) * 100)
              : 0;
            stepsSummary = {
              currentStep,
              totalSteps,
              completedSteps,
              progressPercentage,
              steps: studentSteps,
            };
          } catch (e) {
            stepsSummary = { currentStep: 0, totalSteps: 0, completedSteps: 0, progressPercentage: 0, steps: [] };
          }
          return { ...app.toObject(), steps: stepsSummary };
        })
      );

      res.json({
        success: true,
        data: {
          applications: applicationsWithSteps,
          pagination: {
            current: parseInt(page),
            pages: Math.ceil(total / limit),
            total,
            limit: parseInt(limit),
          },
        },
      });
    } catch (error) {
      console.error("Get all applications error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching applications",
      });
    }
  },

  // Get application statistics
  getApplicationStats: async (req, res) => {
    try {
      // Update this line to exclude archived applications
      const totalApplications = await Application.countDocuments({
        isArchived: { $ne: true },
      });

      const statusCounts = await Application.aggregate([
        // Add this match stage to exclude archived
        { $match: { isArchived: { $ne: true } } },
        {
          $group: {
            _id: "$overallStatus",
            count: { $sum: 1 },
          },
        },
      ]);

      // Update revenue calculation to exclude archived
      const revenueData = await Application.aggregate([
        // Add this match stage to exclude archived
        { $match: { isArchived: { $ne: true } } },
        {
          $lookup: {
            from: "payments",
            localField: "paymentId",
            foreignField: "_id",
            as: "payment",
          },
        },
        {
          $lookup: {
            from: "certifications",
            localField: "certificationId",
            foreignField: "_id",
            as: "certification",
          },
        },
        {
          $match: {
            "payment.status": "completed",
          },
        },
        {
          $group: {
            _id: null,
            totalRevenue: {
              $sum: { $arrayElemAt: ["$certification.price", 0] },
            },
          },
        },
      ]);

      const stats = {
        total: totalApplications,
        inProgress: 0,
        completed: 0,
        revenue: revenueData[0]?.totalRevenue || 0,
      };

      // Process status counts
      statusCounts.forEach((status) => {
        if (
          status._id === "in_progress" ||
          status._id === "assessment_pending"
        ) {
          stats.inProgress += status.count;
        }
        if (status._id === "certificate_issued" || status._id === "completed") {
          stats.completed += status.count;
        }
      });

      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      console.error("Get application stats error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching application statistics",
      });
    }
  },

  // Get specific application details
  getApplicationDetails: async (req, res) => {
    try {
      try { require("../utils/tprEmailPoller").pollTPRInbox().catch(() => {}); } catch (_) {}
      const { applicationId } = req.params;

      const application = await Application.findById(applicationId)
        .populate("userId", "firstName lastName email phoneCode phoneNumber createdAt")
        .populate("certificationId", "name price description")
        .populate("assignedAssessor", "firstName lastName email")
        .populate("assignedAgent", "firstName lastName email")
        .populate("initialScreeningFormId")
        .populate("paymentId")
        .populate("documentUploadId", "status documents")
        .populate("certificateId");

      if (!application) {
        return res.status(404).json({
          success: false,
          message: "Application not found",
        });
      }

      // Get form submissions with populated template info
      const formSubmissions = await FormSubmission.find({
        applicationId: applicationId,
      }).populate("formTemplateId", "name stepNumber filledBy");

      // Get third-party form submissions
      const thirdPartySubmissions = await ThirdPartyFormSubmission.find({
        applicationId: applicationId,
      }).populate("formTemplateId", "name stepNumber filledBy");

      // Handle enrolment form versions - only show one version based on existing submissions
      const oldEnrolmentFormId = '686de5a7259aaa972b4f881b';
      const newEnrolmentFormId = '68ac3ad0652cce1dbeacf8e0';
      
      // Check if user has submission to old enrolment form
      const hasOldEnrolmentSubmission = formSubmissions.some(sub => 
        sub.formTemplateId && sub.formTemplateId._id.toString() === oldEnrolmentFormId
      );
      
      // Filter form submissions based on enrolment form logic
      let filteredFormSubmissions = formSubmissions;
      let filteredThirdPartySubmissions = thirdPartySubmissions;
      
      if (hasOldEnrolmentSubmission) {
        // If user submitted to old form, only show old form submissions
        filteredFormSubmissions = formSubmissions.filter(sub => 
          !sub.formTemplateId || sub.formTemplateId._id.toString() !== newEnrolmentFormId
        );
        filteredThirdPartySubmissions = thirdPartySubmissions.filter(sub => 
          !sub.formTemplateId || sub.formTemplateId._id.toString() !== newEnrolmentFormId
        );
      } else {
        // If no old form submission, only show new form submissions
        filteredFormSubmissions = formSubmissions.filter(sub => 
          !sub.formTemplateId || sub.formTemplateId._id.toString() !== oldEnrolmentFormId
        );
        filteredThirdPartySubmissions = thirdPartySubmissions.filter(sub => 
          !sub.formTemplateId || sub.formTemplateId._id.toString() !== oldEnrolmentFormId
        );
      }

      // Transform regular form submissions to match frontend expectations
      const transformedForms = filteredFormSubmissions.map((sub) => ({
          stepNumber: sub.stepNumber,
          formTemplateId: sub.formTemplateId._id,
          formSubmissionId: sub._id, // This is what the frontend needs
          submissionId: sub._id, // Also add this for compatibility
          title: sub.formTemplateId.name,
          status: (sub.entryType === 'admin_manual') ? 'manual_entry' : sub.status,
          submittedAt: sub.submittedAt,
          filledBy: sub.filledBy,
          assessed: sub.assessed,
      }));

      // Transform third-party form submissions
      const transformedThirdPartyForms = filteredThirdPartySubmissions.map((tpSub) => ({
          stepNumber: tpSub.stepNumber,
          formTemplateId: tpSub.formTemplateId._id,
          formSubmissionId: tpSub._id, // This is what the frontend needs
          submissionId: tpSub._id, // Also add this for compatibility
          title: tpSub.formTemplateId.name,
          status: tpSub.status, // This will show "partially_completed" for partial submissions
          submittedAt: tpSub.referenceSubmission.isSubmitted ? tpSub.referenceSubmission.submittedAt : 
                       tpSub.employerSubmission.isSubmitted ? tpSub.employerSubmission.submittedAt : 
                       tpSub.combinedSubmission.isSubmitted ? tpSub.combinedSubmission.submittedAt : null,
          filledBy: "third-party",
          assessed: "pending", // Third-party forms are typically not assessed by assessors
          // Add third-party specific data
          thirdParty: {
            id: tpSub._id,
            status: tpSub.status,
            employerName: tpSub.employerName,
            employerEmail: tpSub.employerEmail,
            referenceName: tpSub.referenceName,
            referenceEmail: tpSub.referenceEmail,
            employerSubmitted: tpSub.employerSubmission.isSubmitted,
            referenceSubmitted: tpSub.referenceSubmission.isSubmitted,
            combinedSubmitted: tpSub.combinedSubmission.isSubmitted,
            isSameEmail: tpSub.isSameEmail,
            expiresAt: tpSub.expiresAt,
            // Include partial form data for review
            employerFormData: tpSub.employerSubmission.isSubmitted ? tpSub.employerSubmission.formData : null,
            referenceFormData: tpSub.referenceSubmission.isSubmitted ? tpSub.referenceSubmission.formData : null,
            combinedFormData: tpSub.combinedSubmission.isSubmitted ? tpSub.combinedSubmission.formData : null,
          }
      }));

      // Combine both types of form submissions
      const allTransformedForms = [...transformedForms, ...transformedThirdPartyForms];

      // Calculate and attach steps data (same as in getAllApplications)
      const { calculateApplicationSteps } = require("../utils/stepCalculator");
      let stepsData = null;
      try {
        const stepResult = await calculateApplicationSteps(applicationId);
        const studentSteps = (stepResult.steps || []).filter(
          (s) => s.isUserVisible === true || s.actor === "student" || s.actor === "third_party"
        );
        const totalSteps = studentSteps.length;
        const completedSteps = studentSteps.filter((s) => s.isCompleted).length;
        const firstIncomplete = studentSteps.find((s) => !s.isCompleted);
        const currentStep = firstIncomplete
          ? firstIncomplete.stepNumber
          : (studentSteps[studentSteps.length - 1]?.stepNumber || 0);
        const progressPercentage = totalSteps > 0
          ? Math.round((completedSteps / totalSteps) * 100)
          : 0;
        stepsData = {
          currentStep,
          totalSteps,
          completedSteps,
          progressPercentage,
          steps: studentSteps,
        };
      } catch (e) {
        console.error("Failed to calculate steps for application detail:", e);
        stepsData = { currentStep: 0, totalSteps: 0, completedSteps: 0, progressPercentage: 0, steps: [] };
      }

      // Determine TPR verification status (true if any TPR for this application is verified)
      let tprVerified = false;
      try {
        const anyVerified = await ThirdPartyFormSubmission.findOne({ applicationId, verificationStatus: 'verified' }).select('_id');
        tprVerified = !!anyVerified;
      } catch (_) {
        tprVerified = false;
      }

      // Convert application to object and add form submissions AND steps
      const applicationWithForms = {
        ...application.toObject(),
        formSubmissions: allTransformedForms, // Include both regular and third-party form submissions
        steps: stepsData, // Add steps data
        tprVerified, // New flag for FE
      };

      res.json({
        success: true,
        data: {
          application: applicationWithForms,
        },
      });
    } catch (error) {
      console.error("Get application details error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching application details",
      });
    }
  },

  // Assign assessor to application
  assignAssessor: async (req, res) => {
    try {
      const { applicationId } = req.params;
      const { assessorId } = req.body;

      // Verify assessor exists and has assessor role
      const assessor = await User.findOne({
        _id: assessorId,
        userType: "assessor",
        isActive: true,
      });

      if (!assessor) {
        return res.status(404).json({
          success: false,
          message: "Assessor not found or not active",
        });
      }

      const application = await Application.findByIdAndUpdate(
        applicationId,
        { assignedAssessor: assessorId },
        { new: true }
      )
        .populate("assignedAssessor", "firstName lastName email")
        .populate("userId", "firstName lastName email")
        .populate("certificationId", "name");

      if (!application) {
        return res.status(404).json({
          success: false,
          message: "Application not found",
        });
      }

      // Send email notifications to both assessor and student
      try {
        const EmailHelpers = require("../utils/emailHelpers");

        // Notify the assessor about the new assignment
        await EmailHelpers.handleAssessorAssignment(
          application.assignedAssessor,
          application.userId,
          application,
          application.certificationId
        );
        console.log(`Assignment notification sent to assessor: ${application.assignedAssessor.email}`);
     
        // Notify the student about their assigned assessor
        await EmailHelpers.handleStudentAssessorAssignment(
          application.userId,
          application.assignedAssessor,
          application,
          application.certificationId
        );
        console.log(`Assessor assignment notification sent to student: ${application.userId.email}`);
      
      } catch (emailError) {
        console.error("Failed to send assignment notification emails:", emailError);
        // Don't fail the assignment if email fails
      }

      res.json({
        success: true,
        message: "Assessor assigned successfully",
        data: application,
      });
    } catch (error) {
      console.error("Assign assessor error:", error);
      res.status(500).json({
        success: false,
        message: "Error assigning assessor",
      });
    }
  },

  // Update application status
  updateApplicationStatus: async (req, res) => {
    try {
      const { applicationId } = req.params;
      const { status, reason } = req.body;

      const application = await Application.findByIdAndUpdate(
        applicationId,
        {
          overallStatus: status,
          ...(status === "completed" && { completedAt: new Date() }),
        },
        { new: true }
      );

      if (!application) {
        return res.status(404).json({
          success: false,
          message: "Application not found",
        });
      }

      res.json({
        success: true,
        message: "Application status updated successfully",
        data: application,
      });
    } catch (error) {
      console.error("Update application status error:", error);
      res.status(500).json({
        success: false,
        message: "Error updating application status",
      });
    }
  },

  // Get available assessors
  getAvailableAssessors: async (req, res) => {
    try {
      const assessors = await User.find({
        userType: "assessor",
        isActive: true,
      }).select("firstName lastName email");

      res.json({
        success: true,
        data: assessors,
      });
    } catch (error) {
      console.error("Get available assessors error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching available assessors",
      });
    }
  },

  // Get available sales agents
  getAvailableAgents: async (req, res) => {
    try {
      const agents = await User.find({
        userType: { $in: ["sales_agent", "sales_manager"] },
        isActive: true,
      }).select("firstName lastName email");

      res.json({
        success: true,
        data: agents,
      });
    } catch (error) {
      console.error("Get available agents error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching available agents",
      });
    }
  },

  // Assign agent to application
  assignAgent: async (req, res) => {
    try {
      const { applicationId } = req.params;
      const { agentId } = req.body;

      // Verify agent exists and has correct role
      const agent = await User.findOne({
        _id: agentId,
        userType: { $in: ["sales_agent", "sales_manager"] },
        isActive: true,
      });

      if (!agent) {
        return res.status(404).json({
          success: false,
          message: "Agent not found or not active",
        });
      }

      const application = await Application.findByIdAndUpdate(
        applicationId,
        { assignedAgent: agentId },
        { new: true }
      ).populate("assignedAgent", "firstName lastName email");

      if (!application) {
        return res.status(404).json({
          success: false,
          message: "Application not found",
        });
      }

      res.json({
        success: true,
        message: "Agent assigned successfully",
        data: application,
      });
    } catch (error) {
      console.error("Assign agent error:", error);
      res.status(500).json({
        success: false,
        message: "Error assigning agent",
      });
    }
  },

  // Update application tracking info
  updateApplicationTracking: async (req, res) => {
    try {
      const { applicationId } = req.params;
      const { callAttempts, contactStatus, leadStatus, internalNotes } =
        req.body;

      const updateData = {};
      if (callAttempts !== undefined) updateData.callAttempts = callAttempts;
      if (contactStatus !== undefined) updateData.contactStatus = contactStatus;
      if (leadStatus !== undefined) updateData.leadStatus = leadStatus;
      if (internalNotes !== undefined) updateData.internalNotes = internalNotes;

      const application = await Application.findByIdAndUpdate(
        applicationId,
        updateData,
        { new: true }
      )
        .populate("userId", "firstName lastName email")
        .populate("certificationId", "name price")
        .populate("assignedAssessor", "firstName lastName email")
        .populate("assignedAgent", "firstName lastName email");

      if (!application) {
        return res.status(404).json({
          success: false,
          message: "Application not found",
        });
      }

      res.json({
        success: true,
        message: "Application tracking updated successfully",
        data: application,
      });
    } catch (error) {
      console.error("Update application tracking error:", error);
      res.status(500).json({
        success: false,
        message: "Error updating application tracking",
      });
    }
  },

  getFormSubmissionDetails: async (req, res) => {
    try {
      const { submissionId } = req.params;

      // First try to find a regular FormSubmission
      let submission = await FormSubmission.findById(submissionId)
        .populate("formTemplateId", "name description formStructure formType scoringConfig")
        .populate("userId", "firstName lastName email")
        .populate("applicationId", "overallStatus")
        .populate("assessedBy", "firstName lastName email");

      let isThirdParty = false;

      // If not found, try to find a ThirdPartyFormSubmission
      if (!submission) {
        const thirdPartySubmission = await ThirdPartyFormSubmission.findById(submissionId)
          .populate("formTemplateId", "name description formStructure formType scoringConfig")
          .populate("userId", "firstName lastName email")
          .populate("applicationId", "overallStatus");

        if (thirdPartySubmission) {
          // Transform third-party submission to match regular submission format
          submission = {
            _id: thirdPartySubmission._id,
            formTemplateId: thirdPartySubmission.formTemplateId,
            userId: thirdPartySubmission.userId,
            applicationId: thirdPartySubmission.applicationId,
            stepNumber: thirdPartySubmission.stepNumber,
            filledBy: "third-party",
            formData: thirdPartySubmission.isSameEmail 
              ? thirdPartySubmission.combinedSubmission.formData 
              : {
                  ...thirdPartySubmission.employerSubmission.formData,
                  ...thirdPartySubmission.referenceSubmission.formData
                },
            status: thirdPartySubmission.status,
            submittedAt: thirdPartySubmission.referenceSubmission.isSubmitted 
              ? thirdPartySubmission.referenceSubmission.submittedAt 
              : thirdPartySubmission.employerSubmission.isSubmitted 
              ? thirdPartySubmission.employerSubmission.submittedAt 
              : thirdPartySubmission.combinedSubmission.isSubmitted 
              ? thirdPartySubmission.combinedSubmission.submittedAt 
              : null,
            assessed: "pending",
            assessmentNotes: null,
            resubmissionRequired: false,
            version: 1,
            createdAt: thirdPartySubmission.createdAt,
            updatedAt: thirdPartySubmission.updatedAt,
            // Add third-party specific data
            thirdParty: {
              id: thirdPartySubmission._id,
              status: thirdPartySubmission.status,
              employerName: thirdPartySubmission.employerName,
              employerEmail: thirdPartySubmission.employerEmail,
              referenceName: thirdPartySubmission.referenceName,
              referenceEmail: thirdPartySubmission.referenceEmail,
              employerSubmitted: thirdPartySubmission.employerSubmission.isSubmitted,
              referenceSubmitted: thirdPartySubmission.referenceSubmission.isSubmitted,
              combinedSubmitted: thirdPartySubmission.combinedSubmission.isSubmitted,
              isSameEmail: thirdPartySubmission.isSameEmail,
              expiresAt: thirdPartySubmission.expiresAt,
              employerFormData: thirdPartySubmission.employerSubmission.isSubmitted 
                ? thirdPartySubmission.employerSubmission.formData 
                : null,
              referenceFormData: thirdPartySubmission.referenceSubmission.isSubmitted 
                ? thirdPartySubmission.referenceSubmission.formData 
                : null,
              combinedFormData: thirdPartySubmission.combinedSubmission.isSubmitted 
                ? thirdPartySubmission.combinedSubmission.formData 
                : null,
            }
          };
          isThirdParty = true;
        }
      }

      if (!submission) {
        return res.status(404).json({
          success: false,
          message: "Form submission not found",
        });
      }

      // Auto-initialize LLN scoring if missing or not computed (only for regular FormSubmission)
      try {
        if (!isThirdParty && submission.formTemplateId && submission.formTemplateId.formType === 'lln_test') {
          const isAlreadyMarked = !!(submission.scoringData && submission.scoringData.isMarked === true);
          const needsInit = !submission.scoringData ||
            !Array.isArray(submission.scoringData.scoreBreakdown) ||
            submission.scoringData.scoreBreakdown.length === 0 ||
            ((!submission.scoringData.maxScore || submission.scoringData.maxScore === 0) && !isAlreadyMarked);

          if (needsInit) {
            const scoreBreakdown = llnScoringService.initializeScoreFields(
              submission.formTemplateId,
              submission.formData || {}
            );
            const totals = llnScoringService.calculateScores(scoreBreakdown);
            submission.formType = 'lln_test';
            submission.scoringData = {
              isMarked: false,
              markedBy: undefined,
              markedAt: undefined,
              scoreBreakdown,
              totalScore: totals.totalScore,
              maxScore: totals.maxScore,
              percentage: totals.percentage,
            };
            submission.markModified && submission.markModified('scoringData');
            await submission.save();
          } else {
            // If already marked but totals are inconsistent (e.g., maxScore 0), recompute totals only
            const breakdown = submission.scoringData?.scoreBreakdown || [];
            const sums = llnScoringService.calculateScores(breakdown);
            const totalsMissing = (!submission.scoringData?.maxScore || submission.scoringData.maxScore === 0) && (sums.maxScore > 0);
            if (totalsMissing) {
              submission.scoringData.totalScore = sums.totalScore;
              submission.scoringData.maxScore = sums.maxScore;
              submission.scoringData.percentage = sums.percentage;
              submission.markModified && submission.markModified('scoringData');
              await submission.save();
            }
          }
        }
      } catch (initErr) {
        console.warn('[LLN] Auto-initialization skipped:', initErr?.message);
      }

      res.json({
        success: true,
        data: submission,
        isThirdParty: isThirdParty,
      });
    } catch (error) {
      console.error("Get form submission details error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching form submission details",
      });
    }
  },

  archiveApplication: async (req, res) => {
    try {
      const { applicationId } = req.params;

      const application = await Application.findByIdAndUpdate(
        applicationId,
        {
          isArchived: true,
          archivedAt: new Date(),
          archivedBy: req.user.id,
        },
        { new: true }
      );

      if (!application) {
        return res.status(404).json({
          success: false,
          message: "Application not found",
        });
      }

      res.json({
        success: true,
        message: "Application archived successfully",
        data: application,
      });
    } catch (error) {
      console.error("Archive application error:", error);
      res.status(500).json({
        success: false,
        message: "Error archiving application",
      });
    }
  },

  // Get archived applications
  getArchivedApplications: async (req, res) => {
    try {
      const {
        page = 1,
        limit = 10,
        status,
        search,
        sortBy = "newest",
      } = req.query;

      // Build filter object for archived applications
      const filter = { isArchived: true };
      if (status && status !== "all" && status !== "undefined") {
          filter.overallStatus = status;
      }

      // Build search query
      let searchFilter = {};
      if (search && search.trim() !== "" && search !== "undefined") {
        const users = await User.find({
          $or: [
            { firstName: { $regex: search, $options: "i" } },
            { lastName: { $regex: search, $options: "i" } },
            { email: { $regex: search, $options: "i" } },
            // Add full name search using $expr and $concat
            {
              $expr: {
                $regexMatch: {
                  input: { $concat: ["$firstName", " ", "$lastName"] },
                  regex: search,
                  options: "i"
                }
              }
            }
          ],
        }).select("_id");

        const userIds = users.map((user) => user._id);
        searchFilter = { userId: { $in: userIds } };
      }

      // Combine filters
      const finalFilter = { ...filter, ...searchFilter };
   
      // Build sort object
      let sortObject = {};
      switch (sortBy) {
        case "oldest":
          sortObject = { archivedAt: 1 };
          break;
        default: // newest
          sortObject = { archivedAt: -1 };
      }

      // Get archived applications
      const applications = await Application.find(finalFilter)
        .populate("userId", "firstName lastName email")
        .populate("certificationId", "name price")
        .populate("archivedBy", "firstName lastName")
        .limit(limit * 1)
        .skip((page - 1) * limit)
        .sort(sortObject);

      // Get total count
      const total = await Application.countDocuments(finalFilter);
     
      res.json({
        success: true,
        data: {
          applications,
          pagination: {
            current: parseInt(page),
            pages: Math.ceil(total / limit),
            total,
            limit: parseInt(limit),
          },
        },
      });
    } catch (error) {
      console.error("Get archived applications error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching archived applications",
      });
    }
  },

  // Restore archived application
  restoreApplication: async (req, res) => {
    try {
      const { applicationId } = req.params;

      const application = await Application.findByIdAndUpdate(
        applicationId,
        {
          isArchived: false,
          archivedAt: undefined,
          archivedBy: undefined,
          restoredAt: new Date(),
          restoredBy: req.user.id,
        },
        { new: true }
      );

      if (!application) {
        return res.status(404).json({
          success: false,
          message: "Application not found",
        });
      }

      res.json({
        success: true,
        message: "Application restored successfully",
        data: application,
      });
    } catch (error) {
      console.error("Restore application error:", error);
      res.status(500).json({
        success: false,
        message: "Error restoring application",
      });
    }
  },

  // Get application profit calculation
  getApplicationProfit: async (req, res) => {
    try {
      const { applicationId } = req.params;

      const application = await Application.findById(applicationId)
        .populate("certificationId")
        .populate("paymentId");

      if (!application) {
        return res.status(404).json({
          success: false,
          message: "Application not found",
        });
      }

      const certificationPrice = application.certificationId.price;
      const baseExpense = application.certificationId.baseExpense || 0;
      const paidAmount = application.paymentId?.totalAmount || 0;
      const discount = certificationPrice - paidAmount;
      const profit = paidAmount - baseExpense;

      const profitData = {
        applicationId: application._id,
        certificationName: application.certificationId.name,
        originalPrice: certificationPrice,
        paidAmount: paidAmount,
        discount: discount,
        baseExpense: baseExpense,
        profit: profit,
        profitMargin:
          paidAmount > 0 ? ((profit / paidAmount) * 100).toFixed(2) : 0,
        paymentStatus: application.paymentId?.status || "pending",
      };

      res.json({
        success: true,
        data: profitData,
      });
    } catch (error) {
      console.error("Get application profit error:", error);
      res.status(500).json({
        success: false,
        message: "Error calculating application profit",
      });
    }
  },

  // Create manual form entry
  createManualEntry: async (req, res) => {
    try {
      const { applicationId, formTemplateId } = req.params;
      const { formData, reason, adminNotes, completedByAdmin, completionMode } = req.body;
      const adminId = req.user._id;

      console.log(`[Manual Entry] Creating manual entry for application: ${applicationId}, formTemplate: ${formTemplateId}, admin: ${adminId}`);

      // Verify application exists
      const application = await Application.findById(applicationId)
        .populate('userId', 'firstName lastName email');

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

      console.log(`[Manual Entry] Found form template: ${formTemplate.name}, stepNumber: ${formTemplate.stepNumber}`);

      // Debug: Check existing submissions for this application
      const existingSubmissions = await FormSubmission.find({ applicationId });
      console.log(`[Manual Entry] Existing submissions for application ${applicationId}:`, existingSubmissions.map(s => ({
        id: s._id,
        formTemplateId: s.formTemplateId,
        entryType: s.entryType,
        status: s.status
      })));

      // Check if submission already exists
      const existingSubmission = await FormSubmission.findOne({
        applicationId,
        formTemplateId,
        userId: application.userId._id,
      });

      if (existingSubmission) {
        console.log(`[Manual Entry] Submission already exists for formTemplate: ${formTemplateId}`);
        return res.status(400).json({
          success: false,
          message: "Form submission already exists for this application",
        });
      }

      // Enhanced validation based on completion mode
      if (completedByAdmin && completionMode === 'complete-form') {
        // For admin form completion, require complete form data
        if (!formData || Object.keys(formData).length === 0) {
          return res.status(400).json({
            success: false,
            message: "Form data is required for admin form completion",
          });
        }

        // Validate all required fields with admin context
        const formSubmissionController = require('./formSubmissionController');
        const validationResult = formSubmissionController.validateFormDataWithAdminContext(
          formData,
          formTemplate.formStructure,
          true // isAdminCompletion
        );
        if (!validationResult.isValid) {
          return res.status(400).json({
            success: false,
            message: "Form data validation failed",
            errors: validationResult.errors,
          });
        }
      } else if (formData && Object.keys(formData).length > 0) {
        // For manual entries with partial data, validate what's provided
        const formSubmissionController = require('./formSubmissionController');
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
      }

      // Create manual entry submission
      const submissionData = {
        applicationId,
        formTemplateId,
        userId: application.userId._id,
        stepNumber: formTemplate.stepNumber,
        filledBy: formTemplate.filledBy,
        formData,
        status: "submitted",
        submittedAt: new Date(),
        entryType: "admin_manual",
        manuallyEnteredBy: adminId,
        manuallyEnteredAt: new Date(),
        manualEntryReason: reason,
        adminNotes: adminNotes || "",
        completedByAdmin: completedByAdmin || false,
        completionMode: completionMode || 'mark-entered',
      };

      // Check if this is an LLN test and initialize scoring
      if (formTemplate.formType === 'lln_test' || 
          (formTemplate.name && formTemplate.name.toLowerCase().includes('lln'))) {
        submissionData.formType = 'lln_test';
        submissionData.scoringData = {
          isMarked: false,
          scoreBreakdown: llnScoringService.initializeScoreFields(formTemplate, formData || {}),
          totalScore: 0,
          maxScore: 0,
          percentage: 0
        };
      }

      const submission = await FormSubmission.create(submissionData);

      console.log(`[Manual Entry] Created submission: ${submission._id} for formTemplate: ${formTemplateId}`);

      // Debug: Check submissions after creation
      const submissionsAfter = await FormSubmission.find({ applicationId });
      console.log(`[Manual Entry] Submissions after creation for application ${applicationId}:`, submissionsAfter.map(s => ({
        id: s._id,
        formTemplateId: s.formTemplateId,
        entryType: s.entryType,
        status: s.status
      })));

      // Update application progress
      try {
        const { updateApplicationStep } = require("../utils/stepCalculator");
        await updateApplicationStep(applicationId);
        console.log(`[Manual Entry] Updated application step for: ${applicationId}`);
      } catch (stepError) {
        console.error("Error updating application steps:", stepError);
      }

      // Email notification disabled - no emails sent to students
      console.log(`[Manual Entry] Email notification disabled - no email sent to student: ${application.userId.email}`);

      res.status(201).json({
        success: true,
        message: completedByAdmin ? "Form completed by admin successfully" : "Manual form entry created successfully",
        data: {
          submission: {
            id: submission._id,
            entryType: submission.entryType,
            manuallyEnteredBy: adminId,
            manuallyEnteredAt: submission.manuallyEnteredAt,
            completedByAdmin: submission.completedByAdmin,
            completionMode: submission.completionMode,
            stepUpdated: true,
          },
        },
      });
    } catch (error) {
      console.error("Create manual entry error:", error);
      res.status(500).json({
        success: false,
        message: "Error creating manual entry",
        error: error.message,
      });
    }
  },

  // Complete form as admin (dedicated endpoint for form completion)
  completeFormAsAdmin: async (req, res) => {
    try {
      const { applicationId, formTemplateId } = req.params;
      const { formData, reason, adminNotes } = req.body;
      const adminId = req.user._id;

      // Verify application exists
      const application = await Application.findById(applicationId)
        .populate('userId', 'firstName lastName email');

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

      // Check if submission already exists
      const existingSubmission = await FormSubmission.findOne({
        applicationId,
        formTemplateId,
        userId: application.userId._id,
      });

      if (existingSubmission) {
        return res.status(400).json({
          success: false,
          message: "Form submission already exists for this application",
        });
      }

      // Validate form data - admin completion requires complete data
      if (!formData || Object.keys(formData).length === 0) {
        return res.status(400).json({
          success: false,
          message: "Form data is required for admin form completion",
        });
      }

      const formSubmissionController = require('./formSubmissionController');
      const validationResult = formSubmissionController.validateFormDataWithAdminContext(
        formData,
        formTemplate.formStructure,
        true // isAdminCompletion
      );
      if (!validationResult.isValid) {
        return res.status(400).json({
          success: false,
          message: "Form data validation failed",
          errors: validationResult.errors,
        });
      }

      // Create admin-completed submission
      const submissionData = {
        applicationId,
        formTemplateId,
        userId: application.userId._id,
        stepNumber: formTemplate.stepNumber,
        filledBy: formTemplate.filledBy,
        formData,
        status: "submitted",
        submittedAt: new Date(),
        entryType: "admin_manual",
        manuallyEnteredBy: adminId,
        manuallyEnteredAt: new Date(),
        manualEntryReason: reason,
        adminNotes: adminNotes || "",
        completedByAdmin: true,
        completionMode: 'complete-form',
      };

      // Check if this is an LLN test and initialize scoring
      if (formTemplate.formType === 'lln_test' || 
          (formTemplate.name && formTemplate.name.toLowerCase().includes('lln'))) {
        submissionData.formType = 'lln_test';
        submissionData.scoringData = {
          isMarked: false,
          scoreBreakdown: llnScoringService.initializeScoreFields(formTemplate, formData),
          totalScore: 0,
          maxScore: 0,
          percentage: 0
        };
      }

      const submission = await FormSubmission.create(submissionData);

      // Update application progress
      try {
        const { updateApplicationStep } = require("../utils/stepCalculator");
        await updateApplicationStep(applicationId);
      } catch (stepError) {
        console.error("Error updating application steps:", stepError);
      }

      // Email notification disabled - no emails sent to students
      console.log(`[Manual Entry] Email notification disabled - no email sent to student: ${application.userId.email}`);

      res.status(201).json({
        success: true,
        message: "Form completed by admin successfully",
        data: {
          submission: {
            id: submission._id,
            entryType: submission.entryType,
            manuallyEnteredBy: adminId,
            manuallyEnteredAt: submission.manuallyEnteredAt,
            completedByAdmin: true,
            completionMode: 'complete-form',
            stepUpdated: true,
          },
        },
      });
    } catch (error) {
      console.error("Complete form as admin error:", error);
      res.status(500).json({
        success: false,
        message: "Error completing form as admin",
        error: error.message,
      });
    }
  },

  // Get form template for admin completion
  getFormTemplateForAdmin: async (req, res) => {
    try {
      const { formTemplateId } = req.params;

      const formTemplate = await FormTemplate.findById(formTemplateId);
      if (!formTemplate) {
        return res.status(404).json({
          success: false,
          message: "Form template not found",
        });
      }

      // Return form template with all necessary data for admin completion
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
            formType: formTemplate.formType,
            scoringConfig: formTemplate.scoringConfig,
            version: formTemplate.version,
            isActive: formTemplate.isActive,
          },
        },
      });
    } catch (error) {
      console.error("Get form template for admin error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching form template",
        error: error.message,
      });
    }
  },

  // Get manual entry history for an application
  getManualEntries: async (req, res) => {
    try {
      const { applicationId } = req.params;

      const manualEntries = await FormSubmission.find({
        applicationId,
        entryType: "admin_manual",
      })
        .populate("formTemplateId", "name description stepNumber")
        .populate("manuallyEnteredBy", "firstName lastName email")
        .populate("userId", "firstName lastName email")
        .sort({ manuallyEnteredAt: -1 });

      res.status(200).json({
        success: true,
        data: manualEntries,
      });
    } catch (error) {
      console.error("Get manual entries error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching manual entries",
        error: error.message,
      });
    }
  },

  // Revert manual entry
  revertManualEntry: async (req, res) => {
    try {
      const { applicationId, submissionId } = req.params;
      const adminId = req.user._id;

      const submission = await FormSubmission.findOne({
        _id: submissionId,
        applicationId,
        entryType: "admin_manual",
      });

      if (!submission) {
        return res.status(404).json({
          success: false,
          message: "Manual entry not found",
        });
      }

      // Delete the manual entry
      await FormSubmission.findByIdAndDelete(submissionId);

      // Update application progress
      try {
        const { updateApplicationStep } = require("../utils/stepCalculator");
        await updateApplicationStep(applicationId);
      } catch (stepError) {
        console.error("Error updating application steps:", stepError);
      }

      res.status(200).json({
        success: true,
        message: "Manual entry reverted successfully",
        data: {
          submissionId,
          revertedBy: adminId,
          revertedAt: new Date(),
        },
      });
    } catch (error) {
      console.error("Revert manual entry error:", error);
      res.status(500).json({
        success: false,
        message: "Error reverting manual entry",
        error: error.message,
      });
    }
  },
};

module.exports = adminApplicationController;
