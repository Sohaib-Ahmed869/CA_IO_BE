// controllers/adminApplicationController.js
const Application = require("../models/application");
const User = require("../models/user");
const FormSubmission = require("../models/formSubmission");
const { logMe } = require("../utils/logger");
const { pollTPRInbox } = require("../utils/tprEmailPoller");


const adminApplicationController = {
  // Get all applications with filtering and pagination
  getAllApplications: async (req, res) => {
    try {
      // Trigger TPR inbox poll (no-op if disabled)
      pollTPRInbox && pollTPRInbox();
      const {
        page = 1,
        limit = 10,
        status,
        search,
        sortBy = "newest",
        assessor,
      } = req.query;

      // Build filter object - CRITICAL: Add RTO isolation
      const filter = { isArchived: { $ne: true } };
      
      // Add RTO context filtering
      if (req.rtoConfig) {
        filter.rtoId = req.rtoConfig._id;
      }
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
          },
        },
      });
    } catch (error) {
      logMe("admin_apps.list_error", error, "error");
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
      logMe("admin_apps.stats_error", error, "error");
      res.status(500).json({
        success: false,
        message: "Error fetching application statistics",
      });
    }
  },

  // Get specific application details
  getApplicationDetails: async (req, res) => {
    try {
      // Polling is only executed via explicit poll endpoint; do not poll here
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

      // Transform form submissions to match frontend expectations
      const transformedForms = formSubmissions.map((sub) => {
        const isAssessorForm = sub.filledBy === "assessor";
        const isSubmitted = sub.status === "submitted" || !!sub.submittedAt;
        return {
          stepNumber: sub.stepNumber,
          formTemplateId: sub.formTemplateId._id,
          formSubmissionId: sub._id, // This is what the frontend needs
          submissionId: sub._id, // Also add this for compatibility
          title: sub.formTemplateId.name,
          status: sub.status,
          submittedAt: sub.submittedAt,
          filledBy: sub.filledBy,
          assessed: isAssessorForm && isSubmitted
            ? "completed"
            : (sub.assessed === true ? "approved" : sub.assessed || "pending"),
        };
      });

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
        logMe("admin_apps.detail_step_calc_error", e, "error");
        stepsData = { currentStep: 0, totalSteps: 0, completedSteps: 0, progressPercentage: 0, steps: [] };
      }

      // Convert application to object and add form submissions AND steps
      // Compute TPR verification status: verified if ANY party (employer/reference/combined) verified
      let tprVerificationStatus = 'pending';
      try {
        const ThirdPartyFormSubmission = require("../models/thirdPartyFormSubmission");
        const tprs = await ThirdPartyFormSubmission.find({ applicationId })
          .select('verification verificationStatus isSameEmail');
        if (tprs && tprs.length) {
          if (tprs.some(t => t.verificationStatus === 'verified')) {
            tprVerificationStatus = 'verified';
          } else if (tprs.some(t => t.verificationStatus === 'rejected')) {
            tprVerificationStatus = 'rejected';
          } else {
            const parts = [];
            for (const t of tprs) {
              parts.push(t.verification?.employer?.status);
              parts.push(t.verification?.reference?.status);
              if (t.isSameEmail) parts.push(t.verification?.combined?.status);
            }
            if (parts.some(s => s === 'verified')) tprVerificationStatus = 'verified';
            else if (parts.some(s => s === 'rejected')) tprVerificationStatus = 'rejected';
          }
        }
      } catch (e) {
        logMe('admin_apps.tpr_status_warn', { message: e.message }, 'warn');
        tprVerificationStatus = 'pending';
      }

      const applicationWithForms = {
        ...application.toObject(),
        formSubmissions: transformedForms, // Replace the array from the model
        steps: stepsData, // Add steps data
        tprVerificationStatus,
      };

      res.json({
        success: true,
        data: {
          application: applicationWithForms,
        },
      });
    } catch (error) {
      logMe("admin_apps.details_error", error, "error");
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
     
        // Notify the student about their assigned assessor
        await EmailHelpers.handleStudentAssessorAssignment(
          application.userId,
          application.assignedAssessor,
          application,
          application.certificationId
        );
      
      } catch (emailError) {
        logMe("email.assignment_notify_error", emailError, "error");
        // Don't fail the assignment if email fails
      }

      res.json({
        success: true,
        message: "Assessor assigned successfully",
        data: application,
      });
    } catch (error) {
      logMe("admin_apps.assign_assessor_error", error, "error");
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
      logMe("admin_apps.update_status_error", error, "error");
      res.status(500).json({
        success: false,
        message: "Error updating application status",
      });
    }
  },

  // Get available assessors
  getAvailableAssessors: async (req, res) => {
    try {
      // Build filter with RTO context
      const filter = {
        userType: "assessor",
        isActive: true,
      };
      
      // Add RTO context filtering
      if (req.rtoConfig) {
        filter.rtoId = req.rtoConfig._id;
      }

      const assessors = await User.find(filter).select("firstName lastName email");

      res.json({
        success: true,
        data: assessors,
      });
    } catch (error) {
      logMe("admin_apps.available_assessors_error", error, "error");
      res.status(500).json({
        success: false,
        message: "Error fetching available assessors",
      });
    }
  },

  // Get available sales agents
  getAvailableAgents: async (req, res) => {
    try {
      // Build filter with RTO context
      const filter = {
        userType: { $in: ["sales_agent", "sales_manager"] },
        isActive: true,
      };
      
      // Add RTO context filtering
      if (req.rtoConfig) {
        filter.rtoId = req.rtoConfig._id;
      }

      const agents = await User.find(filter).select("firstName lastName email");

      res.json({
        success: true,
        data: agents,
      });
    } catch (error) {
      logMe("admin_apps.available_agents_error", error, "error");
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
      logMe("admin_apps.assign_agent_error", error, "error");
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
      logMe("admin_apps.update_tracking_error", error, "error");
      res.status(500).json({
        success: false,
        message: "Error updating application tracking",
      });
    }
  },

  getFormSubmissionDetails: async (req, res) => {
    try {
      const { submissionId } = req.params;

      const submission = await FormSubmission.findById(submissionId)
        .populate("formTemplateId", "name description formStructure stepNumber filledBy")
        .populate("userId", "firstName lastName email")
        .populate("applicationId", "overallStatus")
        .populate("assessedBy", "firstName lastName email");

      if (!submission) {
        return res.status(404).json({
          success: false,
          message: "Form submission not found",
        });
      }

      // If this is a third-party submission, enrich with employer/reference parts (non-breaking addition)
      let responsePayload = submission.toObject();
      // Normalize step number to dynamic stepCalculator mapping (payment=1, enrolment=2, ...)
      try {
        const { calculateApplicationSteps } = require("../utils/stepCalculator");
        const stepData = await calculateApplicationSteps(submission.applicationId);
        const steps = Array.isArray(stepData?.steps) ? stepData.steps : [];
        // Try to match by formTemplateId stored in step metadata or direct property
        const match = steps.find((s) => {
          const metaId = s?.metadata?.formTemplateId || s?.formTemplateId;
          return metaId && String(metaId) === String(submission.formTemplateId._id);
        }) || steps.find((s) => s.title && s.title === (responsePayload?.formTemplateId?.name || ''));
        if (match && typeof match.stepNumber === 'number') {
          responsePayload.stepNumber = match.stepNumber;
        }
      } catch (_) {}
      try {
        if (submission.filledBy === "third-party") {
          const ThirdPartyFormSubmission = require("../models/thirdPartyFormSubmission");
          const tpr = await ThirdPartyFormSubmission.findOne({
            applicationId: submission.applicationId,
            formTemplateId: submission.formTemplateId,
          });
          if (tpr) {
            responsePayload.thirdParty = {
              status: tpr.status,
              employerSubmission: tpr.employerSubmission
                ? {
                    isSubmitted: !!tpr.employerSubmission.isSubmitted,
                    submittedAt: tpr.employerSubmission.submittedAt,
                    formData: tpr.employerSubmission.formData || {},
                  }
                : null,
              referenceSubmission: tpr.referenceSubmission
                ? {
                    isSubmitted: !!tpr.referenceSubmission.isSubmitted,
                    submittedAt: tpr.referenceSubmission.submittedAt,
                    formData: tpr.referenceSubmission.formData || {},
                  }
                : null,
            };
          }
        }
      } catch (e) {
        logMe("admin_apps.tpr_enrich_warn", { message: e.message }, "warn");
      }

      res.json({
        success: true,
        data: responsePayload,
      });
    } catch (error) {
      logMe("admin_apps.form_submission_details_error", error, "error");
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
      logMe("admin_apps.archive_error", error, "error");
      res.status(500).json({
        success: false,
        message: "Error archiving application",
      });
    }
  },

  // Get archived applications
  getArchivedApplications: async (req, res) => {
    try {
      // Trigger TPR inbox poll (no-op if disabled)
      pollTPRInbox && pollTPRInbox();
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
        // Handle completed status to include both "completed" and "certificate_issued"
        if (status === "completed") {
          filter.overallStatus = { $in: ["completed", "certificate_issued"] };
        } else {
          filter.overallStatus = status;
        }
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

      // Debug: Log the filter being used
   
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

      // Debug: Get status distribution for archived apps
      const statusDistribution = await Application.aggregate([
        { $match: { isArchived: true } },
        { $group: { _id: "$overallStatus", count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]);
     
      res.json({
        success: true,
        data: {
          applications,
          pagination: {
            current: parseInt(page),
            pages: Math.ceil(total / limit),
            total,
          },
          debug: {
            filter: finalFilter,
            statusDistribution
          }
        },
      });
    } catch (error) {
      logMe("admin_apps.archived_list_error", error, "error");
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
      logMe("admin_apps.restore_error", error, "error");
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
      logMe("admin_apps.profit_error", error, "error");
      res.status(500).json({
        success: false,
        message: "Error calculating application profit",
      });
    }
  },

  // Lightweight summary for admin board
  getApplicationSummary: async (req, res) => {
    try {
      const { applicationId } = req.params;

      const application = await Application.findById(applicationId)
        .populate('paymentId');

      if (!application) {
        return res.status(404).json({
          success: false,
          message: 'Application not found',
        });
      }

      // Compute steps using StepCalculator
      let completed = 0;
      let total = 0;
      try {
        const { StepCalculator } = require('../utils/stepCalculator');
        const calc = new StepCalculator(application);
        await calc.calculateSteps();
        const steps = calc.steps || [];
        total = steps.length;
        completed = steps.filter((s) => s.isCompleted).length;
      } catch (e) {
        // Fallback: no steps computed
        completed = 0;
        total = 0;
      }

      return res.json({
        success: true,
        data: {
          applicationId: String(application._id),
          createdAt: application.createdAt,
          overallStatus: application.overallStatus,
          paymentStatus: application.paymentId ? application.paymentId.status : undefined,
          steps: { completed, total },
        },
      });
    } catch (error) {
      logMe('admin_apps.summary_error', error, 'error');
      res.status(500).json({ success: false, message: 'Error fetching application summary' });
    }
  },

  // CEO acknowledge application
  ceoAcknowledge: async (req, res) => {
    try {
      const { applicationId } = req.params;
      const { notes } = req.body;

      const application = await Application.findByIdAndUpdate(
        applicationId,
        {
          ceoAcknowledged: true,
          ceoAcknowledgedAt: new Date(),
          ceoAcknowledgedBy: req.user.id,
          ceoAcknowledgementNotes: notes || "",
        },
        { new: true }
      ).populate('userId', 'firstName lastName email');

      if (!application) {
        return res.status(404).json({ success: false, message: 'Application not found' });
      }

      res.json({ success: true, message: 'CEO acknowledgment recorded', data: application });
    } catch (error) {
      logMe('admin_apps.ceo_ack_error', error, 'error');
      res.status(500).json({ success: false, message: 'Error recording CEO acknowledgment' });
    }
  },

  // CEO revoke acknowledgment
  ceoUnacknowledge: async (req, res) => {
    try {
      const { applicationId } = req.params;
      const application = await Application.findByIdAndUpdate(
        applicationId,
        {
          ceoAcknowledged: false,
          ceoAcknowledgedAt: null,
          ceoAcknowledgedBy: null,
        },
        { new: true }
      );

      if (!application) {
        return res.status(404).json({ success: false, message: 'Application not found' });
      }

      res.json({ success: true, message: 'CEO acknowledgment revoked', data: application });
    } catch (error) {
      logMe('admin_apps.ceo_unack_error', error, 'error');
      res.status(500).json({ success: false, message: 'Error revoking CEO acknowledgment' });
    }
  },
};

module.exports = adminApplicationController;
