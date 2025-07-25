// controllers/assessorDashboardController.js
const Application = require("../models/application");
const FormSubmission = require("../models/formSubmission");
const User = require("../models/user");
const DocumentUpload = require("../models/documentUpload");
const moment = require("moment");

const assessorDashboardController = {
  // Get comprehensive dashboard statistics for assessor
  getDashboardStats: async (req, res) => {
    try {
      const assessorId = req.user.id;

      // Parallel execution of all stats
      const [
        assignedApplications,
        applicationStats,
        weeklyAssessments,
        notifications,
        assessmentSummary,
        recentActivity,
      ] = await Promise.all([
        getAssignedApplications(assessorId),
        calculateApplicationStats(assessorId),
        getWeeklyAssessmentStats(assessorId),
        getAssessorNotifications(assessorId),
        getAssessmentSummary(assessorId),
        getRecentActivity(assessorId),
      ]);

      const dashboardData = {
        assignedApplications,
        stats: applicationStats,
        weeklyAssessments,
        notifications,
        assessmentSummary,
        recentActivity,
        assessorInfo: {
          id: req.user.id,
          name: `${req.user.firstName} ${req.user.lastName}`,
          role: "Senior Assessor", // You can make this dynamic
        },
        lastUpdated: new Date(),
      };

      res.json({
        success: true,
        data: dashboardData,
      });
    } catch (error) {
      console.error("Get assessor dashboard stats error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching dashboard statistics",
      });
    }
  },

  // Get filtered applications for assessor
  getFilteredApplications: async (req, res) => {
    try {
      const assessorId = req.user.id;
      const {
        filter = "all",
        search = "",
        sortBy = "dueDate",
        page = 1,
        limit = 10,
      } = req.query;

      let applicationFilter = {
        assignedAssessor: assessorId,
        isArchived: { $ne: true },
      };

      // Apply filters
      if (filter === "high_priority") {
        // Applications due soon or marked urgent
        const threeDaysFromNow = moment().add(3, "days").toDate();
        applicationFilter.$or = [
          { dueDate: { $lte: threeDaysFromNow } },
          { priority: "high" },
        ];
      } else if (filter === "due_soon") {
        const threeDaysFromNow = moment().add(3, "days").toDate();
        applicationFilter.dueDate = { $lte: threeDaysFromNow };
      } else if (filter === "pending_review") {
        applicationFilter.overallStatus = {
          $in: ["assessment_pending", "under_review"],
        };
      }

      // Search filter
      if (search.trim()) {
        const users = await User.find({
          $or: [
            { firstName: { $regex: search, $options: "i" } },
            { lastName: { $regex: search, $options: "i" } },
            { email: { $regex: search, $options: "i" } },
          ],
        }).select("_id");

        const userIds = users.map((user) => user._id);
        applicationFilter.userId = { $in: userIds };
      }

      // Sort options
      let sortOptions = {};
      switch (sortBy) {
        case "dueDate":
          sortOptions = { dueDate: 1, createdAt: -1 };
          break;
        case "priority":
          sortOptions = { priority: -1, dueDate: 1 };
          break;
        case "studentName":
          sortOptions = { createdAt: -1 }; // We'll sort by user name after population
          break;
        default:
          sortOptions = { createdAt: -1 };
      }

      const applications = await Application.find(applicationFilter)
        .populate("userId", "firstName lastName email phoneNumber")
        .populate("certificationId", "name price")
        .populate("documentUploadId", "status documents")
        .populate("paymentId", "status")
        .sort(sortOptions)
        .limit(limit * 1)
        .skip((page - 1) * limit);

      // Get form submissions for each application
      const applicationsWithDetails = await Promise.all(
        applications.map(async (app) => {
          const [formSubmissions, documents, priority] = await Promise.all([
            FormSubmission.find({ applicationId: app._id }).populate(
              "formTemplateId",
              "name stepNumber filledBy"
            ),
            DocumentUpload.findOne({ applicationId: app._id }),
            calculateApplicationPriority(app),
          ]);

          return {
            ...app.toObject(),
            formSubmissions: formSubmissions.map((sub) => ({
              stepNumber: sub.stepNumber,
              formTemplateId: sub.formTemplateId._id,
              submissionId: sub._id,
              title: sub.formTemplateId.name,
              status: sub.status,
              submittedAt: sub.submittedAt,
              filledBy: sub.filledBy,
              assessed: sub.assessed,
            })),
            documentsCount: documents?.documents?.length || 0,
            formsCount: formSubmissions.length,
            priority: priority,
            completionPercentage: calculateCompletionPercentage(
              formSubmissions,
              documents
            ),
            nextAction: determineNextAction(app, formSubmissions, documents),
          };
        })
      );

      const total = await Application.countDocuments(applicationFilter);

      res.json({
        success: true,
        data: {
          applications: applicationsWithDetails,
          pagination: {
            current: parseInt(page),
            pages: Math.ceil(total / limit),
            total,
          },
          filter,
          search,
          sortBy,
        },
      });
    } catch (error) {
      console.error("Get filtered applications error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching filtered applications",
      });
    }
  },

  // Update assessor notes for application
  updateAssessmentNotes: async (req, res) => {
    try {
      const { applicationId } = req.params;
      const { notes } = req.body;
      const assessorId = req.user.id;

      const application = await Application.findOneAndUpdate(
        {
          _id: applicationId,
          assignedAssessor: assessorId,
        },
        {
          assessmentNotes: notes,
          lastAssessmentUpdate: new Date(),
        },
        { new: true }
      );

      if (!application) {
        return res.status(404).json({
          success: false,
          message: "Application not found or not assigned to you",
        });
      }

      res.json({
        success: true,
        message: "Assessment notes updated successfully",
        data: application,
      });
    } catch (error) {
      console.error("Update assessment notes error:", error);
      res.status(500).json({
        success: false,
        message: "Error updating assessment notes",
      });
    }
  },

  // Get assessor performance metrics
  getPerformanceMetrics: async (req, res) => {
    try {
      const assessorId = req.user.id;
      const { period = "week" } = req.query;

      const startDate = getStartOfPeriod(period);
      const endDate = moment().endOf("day").toDate();

      const metrics = await calculatePerformanceMetrics(
        assessorId,
        startDate,
        endDate
      );

      res.json({
        success: true,
        data: {
          metrics,
          period,
          dateRange: {
            start: startDate,
            end: endDate,
          },
        },
      });
    } catch (error) {
      console.error("Get performance metrics error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching performance metrics",
      });
    }
  },

  // Mark notification as read
  markNotificationRead: async (req, res) => {
    try {
      const { notificationId } = req.params;
      const assessorId = req.user.id;

      // In a real system, you'd have a notifications table
      // For now, we'll just return success
      res.json({
        success: true,
        message: "Notification marked as read",
      });
    } catch (error) {
      console.error("Mark notification read error:", error);
      res.status(500).json({
        success: false,
        message: "Error marking notification as read",
      });
    }
  },
};

// Helper functions
async function getAssignedApplications(assessorId) {
  const applications = await Application.find({
    assignedAssessor: assessorId,
    isArchived: { $ne: true },
  })
    .populate("userId", "firstName lastName email")
    .populate("certificationId", "name")
    .populate("documentUploadId", "status documents")
    .sort({ createdAt: -1 })
    .limit(10);

  return Promise.all(
    applications.map(async (app) => {
      const [formSubmissions, priority] = await Promise.all([
        FormSubmission.find({ applicationId: app._id }),
        calculateApplicationPriority(app),
      ]);

      return {
        id: app._id,
        studentName: `${app.userId.firstName} ${app.userId.lastName}`,
        studentEmail: app.userId.email,
        certificationName: app.certificationId.name,
        currentStep: app.currentStep || "Initial Review",
        priority: priority,
        dueDate: calculateDueDate(app),
        overallStatus: app.overallStatus,
        lastActivity: app.updatedAt,
        nextAction: determineNextAction(app, formSubmissions),
        completionPercentage: calculateCompletionPercentage(formSubmissions),
        documentsCount: app.documentUploadId?.documents?.length || 0,
        formsCount: formSubmissions.length,
      };
    })
  );
}

async function calculateApplicationStats(assessorId) {
  const [totalAssigned, highPriority, completedToday, avgCompletionRate] =
    await Promise.all([
      Application.countDocuments({
        assignedAssessor: assessorId,
        isArchived: { $ne: true },
      }),
      Application.countDocuments({
        assignedAssessor: assessorId,
        isArchived: { $ne: true },
        dueDate: { $lte: moment().add(3, "days").toDate() },
      }),
      getCompletedTodayCount(assessorId),
      calculateAverageCompletionRate(assessorId),
    ]);

  return {
    totalAssigned,
    highPriority,
    completedToday,
    completionRate: avgCompletionRate,
  };
}

async function getWeeklyAssessmentStats(assessorId) {
  const startOfWeek = moment().startOf("week").toDate();
  const endOfWeek = moment().endOf("week").toDate();

  const assessments = await FormSubmission.find({
    assessedBy: assessorId,
    assessedAt: {
      $gte: startOfWeek,
      $lte: endOfWeek,
    },
  });

  return {
    completed: assessments.length,
    approved: assessments.filter((a) => a.assessed === "approved")
      .length,
    requiresChanges: assessments.filter(
      (a) => a.assessed === "requires_changes"
    ).length,
  };
}

async function getAssessorNotifications(assessorId) {
  // Mock notifications - in real system, fetch from notifications table
  const applications = await Application.find({
    assignedAssessor: assessorId,
    isArchived: { $ne: true },
  })
    .populate("userId", "firstName lastName")
    .limit(5);

  const notifications = [];

  // Add urgent notifications for applications due soon
  for (const app of applications) {
    const dueDate = calculateDueDate(app);
    const daysUntilDue = moment(dueDate).diff(moment(), "days");

    if (daysUntilDue <= 2 && daysUntilDue >= 0) {
      notifications.push({
        id: `urgent_${app._id}`,
        type: "urgent",
        title: "Assessment Deadline Approaching",
        message: `${app.userId.firstName} ${app.userId.lastName}'s assessment is due in ${daysUntilDue} day(s)`,
        time: moment().subtract(2, "hours").fromNow(),
        applicationId: app._id,
      });
    }
  }

  // Add new submission notifications
  const recentSubmissions = await FormSubmission.find({
    status: "submitted",
    assessed: "pending",
    submittedAt: { $gte: moment().subtract(1, "day").toDate() },
  })
    .populate({
      path: "applicationId",
      match: { assignedAssessor: assessorId },
      populate: { path: "userId", select: "firstName lastName" },
    })
    .limit(3);

  recentSubmissions.forEach((submission) => {
    if (submission.applicationId) {
      notifications.push({
        id: `new_${submission._id}`,
        type: "new",
        title: "New Submission Received",
        message: `${submission.applicationId.userId.firstName} ${submission.applicationId.userId.lastName} submitted a new form`,
        time: moment(submission.submittedAt).fromNow(),
        applicationId: submission.applicationId._id,
      });
    }
  });

  return notifications.slice(0, 10);
}

async function getAssessmentSummary(assessorId) {
  const startOfWeek = moment().startOf("week").toDate();

  const [weeklyCompleted, avgTimePerAssessment, successRate] =
    await Promise.all([
      FormSubmission.countDocuments({
        assessedBy: assessorId,
        assessedAt: { $gte: startOfWeek },
      }),
      calculateAverageAssessmentTime(assessorId),
      calculateSuccessRate(assessorId),
    ]);

  return {
    weeklyCompleted,
    avgTimePerAssessment: `${avgTimePerAssessment} hours`,
    successRate: `${successRate}%`,
  };
}

async function getRecentActivity(assessorId) {
  const recentAssessments = await FormSubmission.find({
    assessedBy: assessorId,
  })
    .populate({
      path: "applicationId",
      populate: { path: "userId", select: "firstName lastName" },
    })
    .populate("formTemplateId", "name")
    .sort({ assessedAt: -1 })
    .limit(10);

  return recentAssessments.map((assessment) => ({
    id: assessment._id,
    type: "assessment",
    description: `Assessed ${assessment.formTemplateId.name} for ${assessment.applicationId.userId.firstName} ${assessment.applicationId.userId.lastName}`,
    status: assessment.assessed,
    timestamp: assessment.assessedAt,
    applicationId: assessment.applicationId._id,
  }));
}

// Utility functions
function calculateApplicationPriority(application) {
  const dueDate = calculateDueDate(application);
  const daysUntilDue = moment(dueDate).diff(moment(), "days");

  if (daysUntilDue <= 2) return "high";
  if (daysUntilDue <= 7) return "medium";
  return "low";
}

function calculateDueDate(application) {
  // In real system, this would be based on business rules
  // For now, assume 14 days from creation
  return moment(application.createdAt).add(14, "days").format("YYYY-MM-DD");
}

function calculateCompletionPercentage(formSubmissions, documents) {
  // Simple calculation - you can make this more sophisticated
  const submittedForms = formSubmissions.filter(
    (f) => f.status === "submitted"
  ).length;
  const totalForms = formSubmissions.length || 1;
  const hasDocuments =
    documents && documents.documents && documents.documents.length > 0;

  const formPercentage = (submittedForms / totalForms) * 80; // 80% weight for forms
  const docPercentage = hasDocuments ? 20 : 0; // 20% weight for documents

  return Math.round(formPercentage + docPercentage);
}

function determineNextAction(application, formSubmissions, documents) {
  const pendingForms = formSubmissions?.filter(
    (f) => f.status === "submitted" && f.assessed === "pending"
  );

  if (pendingForms && pendingForms.length > 0) {
    return "Review pending form submissions";
  }

  if (documents && documents.status === "under_review") {
    return "Verify uploaded documents";
  }

  if (application.overallStatus === "assessment_pending") {
    return "Complete assessment review";
  }

  return "Review application progress";
}

async function getCompletedTodayCount(assessorId) {
  const startOfDay = moment().startOf("day").toDate();
  const endOfDay = moment().endOf("day").toDate();

  return FormSubmission.countDocuments({
    assessedBy: assessorId,
    assessedAt: {
      $gte: startOfDay,
      $lte: endOfDay,
    },
  });
}

async function calculateAverageCompletionRate(assessorId) {
  // Mock calculation - implement based on your business logic
  return 96;
}

async function calculateAverageAssessmentTime(assessorId) {
  // Mock calculation - implement based on your tracking
  return 2.5;
}

async function calculateSuccessRate(assessorId) {
  const assessments = await FormSubmission.find({
    assessedBy: assessorId,
  });

  if (assessments.length === 0) return 0;

  const approved = assessments.filter(
    (a) => a.assessed === "approved"
  ).length;

  return Math.round((approved / assessments.length) * 100);
}

function getStartOfPeriod(period) {
  switch (period) {
    case "day":
      return moment().startOf("day").toDate();
    case "week":
      return moment().startOf("week").toDate();
    case "month":
      return moment().startOf("month").toDate();
    default:
      return moment().startOf("week").toDate();
  }
}

async function calculatePerformanceMetrics(assessorId, startDate, endDate) {
  const assessments = await FormSubmission.find({
    assessedBy: assessorId,
    assessedAt: {
      $gte: startDate,
      $lte: endDate,
    },
  });

  const totalAssessments = assessments.length;
  const approvedAssessments = assessments.filter(
    (a) => a.assessed === "approved"
  ).length;
  const averageTime = 2.5; // Mock - implement real calculation

  return {
    totalAssessments,
    approvedAssessments,
    approvalRate:
      totalAssessments > 0 ? (approvedAssessments / totalAssessments) * 100 : 0,
    averageAssessmentTime: averageTime,
    productivity: totalAssessments, // Assessments per period
  };
}

module.exports = assessorDashboardController;
