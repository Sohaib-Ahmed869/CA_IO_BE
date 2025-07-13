// controllers/adminDashboardController.js
const Application = require("../models/application");
const Payment = require("../models/payment");
const User = require("../models/user");
const Certificate = require("../models/certificate");
const FormSubmission = require("../models/formSubmission");
const moment = require("moment");

const adminDashboardController = {
  // Get comprehensive dashboard statistics
  getDashboardStats: async (req, res) => {
    try {
      const { period = "month" } = req.query;
      const userRole = req.user.userType; // Get user role from auth middleware

      // Calculate date ranges
      const now = moment();
      const startOfPeriod =
        period === "week"
          ? now.clone().subtract(1, "week").startOf("week")
          : period === "year"
          ? now.clone().subtract(1, "year").startOf("year")
          : now.clone().subtract(1, "month").startOf("month");

      // For sales agents, only get application stats for their assigned applications
      const applicationStats =
        userRole === "sales_agent"
          ? await calculateApplicationStats(startOfPeriod, req.user._id)
          : await calculateApplicationStats(startOfPeriod);

      // Sales agents don't get payment stats
      const paymentStats =
        userRole === "sales_agent"
          ? null
          : await calculatePaymentStats(startOfPeriod);

      const userStats = await calculateUserStats();
      const certificateStats = await calculateCertificateStats();
      const assessorStats = await calculateAssessorAssignmentStats();
      const allTimeStats =
        userRole === "sales_agent"
          ? await calculateAllTimeStats(req.user._id)
          : await calculateAllTimeStats();

      const weeklyApplications =
        userRole === "sales_agent"
          ? await getWeeklyApplications(req.user._id)
          : await getWeeklyApplications();

      const applicationStatusDistribution =
        userRole === "sales_agent"
          ? await getApplicationStatusDistribution(req.user._id)
          : await getApplicationStatusDistribution();

      const topCertifications = await getTopCertifications();

      // Build dashboard data based on role
      const dashboardData = {
        // Main KPIs
        kpis: {
          totalApplications: applicationStats.total,
          completionRate: applicationStats.completionRate,
          conversionRate: applicationStats.conversionRate,
          certificatesGenerated: certificateStats.total,
          totalAgents: userStats.agents,
          numberOfStudents: userStats.students,
          assignedToAssessors: assessorStats.assignedToAssessors,
          unassignedApplications: assessorStats.unassignedApplications,
          // Only include payment stats for non-sales agents
          ...(userRole !== "sales_agent" && {
            paymentsPending: paymentStats.pending,
            paymentsCompleted: paymentStats.completed,
            totalPayments: paymentStats.total,
            paymentPlansTotal: paymentStats.paymentPlans.total,
            paymentPlansOutstanding: paymentStats.paymentPlans.outstanding,
          }),
        },

        // Charts data
        charts: {
          weeklyApplications,
          applicationStatusDistribution,
          topCertifications,
          // Only include payment analytics for non-sales agents
          ...(userRole !== "sales_agent" && {
            paymentAnalytics: await getPaymentAnalytics(startOfPeriod),
          }),
        },

        // Additional metrics
        metrics: {
          applications: {
            thisWeek: applicationStats.thisWeek,
            thisMonth: applicationStats.thisMonth,
            growth: applicationStats.growth,
            allTime: allTimeStats.applications,
          },
          users: {
            allTime: allTimeStats.users,
          },
          // Only include revenue for non-sales agents
          ...(userRole !== "sales_agent" && {
            revenue: {
              total: paymentStats.revenue.total,
              thisMonth: paymentStats.revenue.thisMonth,
              growth: paymentStats.revenue.growth,
              allTime: allTimeStats.revenue,
            },
          }),
        },

        period,
        lastUpdated: new Date(),
        userRole, // Include role for frontend conditional rendering
      };

      res.json({
        success: true,
        data: dashboardData,
      });
    } catch (error) {
      console.error("Get dashboard stats error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching dashboard statistics",
      });
    }
  },

  // Get application trends over time
  getApplicationTrends: async (req, res) => {
    try {
      const { period = "weekly", periods = 12 } = req.query;

      const trends = [];
      const now = moment();

      for (let i = periods - 1; i >= 0; i--) {
        let periodStart, periodEnd;

        if (period === "daily") {
          periodStart = now.clone().subtract(i, "days").startOf("day");
          periodEnd = now.clone().subtract(i, "days").endOf("day");
        } else if (period === "weekly") {
          periodStart = now.clone().subtract(i, "weeks").startOf("week");
          periodEnd = now.clone().subtract(i, "weeks").endOf("week");
        } else if (period === "monthly") {
          periodStart = now.clone().subtract(i, "months").startOf("month");
          periodEnd = now.clone().subtract(i, "months").endOf("month");
        }

        const applications = await Application.countDocuments({
          createdAt: {
            $gte: periodStart.toDate(),
            $lte: periodEnd.toDate(),
          },
        });

        const completed = await Application.countDocuments({
          createdAt: {
            $gte: periodStart.toDate(),
            $lte: periodEnd.toDate(),
          },
          overallStatus: { $in: ["completed", "certificate_issued"] },
        });

        trends.push({
          period: periodStart.format("YYYY-MM-DD"),
          label: formatPeriodLabel(periodStart, period),
          applications,
          completed,
          completionRate:
            applications > 0 ? (completed / applications) * 100 : 0,
        });
      }

      res.json({
        success: true,
        data: {
          trends,
          period,
          periodsCount: periods,
        },
      });
    } catch (error) {
      console.error("Get application trends error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching application trends",
      });
    }
  },

  // Get payment overview
  getPaymentOverview: async (req, res) => {
    try {
      const { period = "month" } = req.query;

      const startOfPeriod =
        period === "week"
          ? moment().subtract(1, "week").startOf("week")
          : period === "year"
          ? moment().subtract(1, "year").startOf("year")
          : moment().subtract(1, "month").startOf("month");

      const paymentOverview = await calculateDetailedPaymentStats(
        startOfPeriod
      );

      res.json({
        success: true,
        data: paymentOverview,
      });
    } catch (error) {
      console.error("Get payment overview error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching payment overview",
      });
    }
  },
};

// Helper functions
async function calculateApplicationStats(startOfPeriod, agentId = null) {
  const baseQuery = { isArchived: { $ne: true } };
  if (agentId) {
    baseQuery.assignedAgent = agentId;
  }

  const total = await Application.countDocuments(baseQuery);

  const completed = await Application.countDocuments({
    ...baseQuery,
    overallStatus: { $in: ["completed", "certificate_issued"] },
  });

  const thisWeek = await Application.countDocuments({
    ...baseQuery,
    createdAt: { $gte: moment().subtract(1, "week").toDate() },
  });

  const thisMonth = await Application.countDocuments({
    ...baseQuery,
    createdAt: { $gte: moment().subtract(1, "month").toDate() },
  });

  const lastMonth = await Application.countDocuments({
    ...baseQuery,
    createdAt: {
      $gte: moment().subtract(2, "months").toDate(),
      $lt: moment().subtract(1, "month").toDate(),
    },
  });

  const inProgress = await Application.countDocuments({
    ...baseQuery,
    overallStatus: {
      $in: ["in_progress", "under_review", "assessment_pending"],
    },
  });

  const completionRate = total > 0 ? (completed / total) * 100 : 0;
  const conversionRate =
    inProgress + completed > 0
      ? (completed / (inProgress + completed)) * 100
      : 0;
  const growth =
    lastMonth > 0 ? ((thisMonth - lastMonth) / lastMonth) * 100 : 0;

  return {
    total,
    completed,
    thisWeek,
    thisMonth,
    completionRate: Math.round(completionRate * 10) / 10,
    conversionRate: Math.round(conversionRate * 10) / 10,
    growth: Math.round(growth * 10) / 10,
  };
}

async function calculatePaymentStats(startOfPeriod) {
  const total = await Payment.countDocuments({});

  const pending = await Payment.countDocuments({
    status: { $in: ["pending", "processing"] },
  });

  const completed = await Payment.countDocuments({
    status: "completed",
  });

  // Payment plans
  const paymentPlansTotal = await Payment.countDocuments({
    paymentType: "payment_plan",
  });

  const paymentPlansOutstanding = await Payment.countDocuments({
    paymentType: "payment_plan",
    status: { $in: ["pending", "processing"] },
  });

  // Revenue calculations
  const totalRevenue = await Payment.aggregate([
    { $match: { status: "completed" } },
    { $group: { _id: null, total: { $sum: "$totalAmount" } } },
  ]);

  const thisMonthRevenue = await Payment.aggregate([
    {
      $match: {
        status: "completed",
        completedAt: { $gte: moment().startOf("month").toDate() },
      },
    },
    { $group: { _id: null, total: { $sum: "$totalAmount" } } },
  ]);

  const lastMonthRevenue = await Payment.aggregate([
    {
      $match: {
        status: "completed",
        completedAt: {
          $gte: moment().subtract(1, "month").startOf("month").toDate(),
          $lt: moment().startOf("month").toDate(),
        },
      },
    },
    { $group: { _id: null, total: { $sum: "$totalAmount" } } },
  ]);

  const revenue = {
    total: totalRevenue[0]?.total || 0,
    thisMonth: thisMonthRevenue[0]?.total || 0,
    growth: 0,
  };

  if (lastMonthRevenue[0]?.total > 0) {
    revenue.growth =
      ((revenue.thisMonth - lastMonthRevenue[0].total) /
        lastMonthRevenue[0].total) *
      100;
  }

  return {
    total,
    pending,
    completed,
    paymentPlans: {
      total: paymentPlansTotal,
      outstanding: paymentPlansOutstanding,
    },
    revenue: {
      ...revenue,
      growth: Math.round(revenue.growth * 10) / 10,
    },
  };
}

async function calculateUserStats() {
  const students = await User.countDocuments({
    userType: "user",
    isActive: true,
  });

  const agents = await User.countDocuments({
    userType: { $in: ["sales_agent", "sales_manager"] },
    isActive: true,
  });

  const assessors = await User.countDocuments({
    userType: "assessor",
    isActive: true,
  });

  return {
    students,
    agents,
    assessors,
  };
}

async function calculateCertificateStats() {
  const total = await Certificate.countDocuments({
    status: "active",
  });

  const thisMonth = await Certificate.countDocuments({
    issuedAt: { $gte: moment().startOf("month").toDate() },
    status: "active",
  });

  return {
    total,
    thisMonth,
  };
}

async function getWeeklyApplications(agentId = null) {
  const data = [];
  const now = moment();

  for (let i = 6; i >= 0; i--) {
    const weekStart = now.clone().subtract(i, "weeks").startOf("week");
    const weekEnd = now.clone().subtract(i, "weeks").endOf("week");

    const baseQuery = {
      createdAt: {
        $gte: weekStart.toDate(),
        $lte: weekEnd.toDate(),
      },
      isArchived: { $ne: true },
    };

    if (agentId) {
      baseQuery.assignedAgent = agentId;
    }

    const applications = await Application.countDocuments(baseQuery);

    data.push({
      week: `W${7 - i}`,
      period: weekStart.format("MMM DD"),
      applications,
    });
  }

  return data;
}

async function getApplicationStatusDistribution(agentId = null) {
  const matchQuery = { isArchived: { $ne: true } };
  if (agentId) {
    matchQuery.assignedAgent = agentId;
  }

  const statusCounts = await Application.aggregate([
    { $match: matchQuery },
    {
      $group: {
        _id: "$overallStatus",
        count: { $sum: 1 },
      },
    },
  ]);

  const statusMap = {
    completed: { name: "Completed", color: "#A1DB89" },
    certificate_issued: { name: "Completed", color: "#A1DB89" },
    in_progress: { name: "In Progress", color: "#FFA076" },
    under_review: { name: "Under Review", color: "#80A6FF" },
    assessment_pending: { name: "Under Review", color: "#80A6FF" },
    payment_pending: { name: "Pending", color: "#929497" },
    rejected: { name: "Rejected", color: "#FF6B6B" },
  };

  const distribution = {};
  statusCounts.forEach(({ _id, count }) => {
    const status = statusMap[_id] || { name: "Other", color: "#929497" };
    if (distribution[status.name]) {
      distribution[status.name].value += count;
    } else {
      distribution[status.name] = {
        name: status.name,
        value: count,
        color: status.color,
      };
    }
  });

  return Object.values(distribution);
}

async function getPaymentAnalytics(startOfPeriod) {
  const data = [];
  const now = moment();

  for (let i = 5; i >= 0; i--) {
    const monthStart = now.clone().subtract(i, "months").startOf("month");
    const monthEnd = now.clone().subtract(i, "months").endOf("month");

    const completed = await Payment.aggregate([
      {
        $match: {
          status: "completed",
          completedAt: {
            $gte: monthStart.toDate(),
            $lte: monthEnd.toDate(),
          },
        },
      },
      {
        $group: {
          _id: null,
          amount: { $sum: "$totalAmount" },
          count: { $sum: 1 },
        },
      },
    ]);

    const pending = await Payment.countDocuments({
      status: { $in: ["pending", "processing"] },
      createdAt: {
        $gte: monthStart.toDate(),
        $lte: monthEnd.toDate(),
      },
    });

    data.push({
      month: monthStart.format("MMM"),
      period: monthStart.format("YYYY-MM"),
      completed: completed[0]?.amount || 0,
      pending: pending,
      count: completed[0]?.count || 0,
    });
  }

  return data;
}

async function getTopCertifications() {
  const certificationCounts = await Application.aggregate([
    { $match: { isArchived: { $ne: true } } },
    {
      $lookup: {
        from: "certifications",
        localField: "certificationId",
        foreignField: "_id",
        as: "certification",
      },
    },
    { $unwind: "$certification" },
    {
      $group: {
        _id: "$certification.name",
        count: { $sum: 1 },
      },
    },
    { $sort: { count: -1 } },
    { $limit: 5 },
  ]);

  return certificationCounts.map(({ _id, count }) => ({
    qualification: _id,
    count,
  }));
}
async function getTopCertifications() {
  try {
    const certificationCounts = await Application.aggregate([
      { $match: { isArchived: { $ne: true } } },
      {
        $lookup: {
          from: "certifications", // Make sure this matches your actual collection name
          localField: "certificationId",
          foreignField: "_id",
          as: "certification",
        },
      },
      { $unwind: "$certification" },
      {
        $group: {
          _id: "$certification.name",
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 5 },
    ]);

    // If aggregate returns empty, try a fallback approach
    if (certificationCounts.length === 0) {
      const fallbackCounts = await Application.find({
        isArchived: { $ne: true },
      })
        .populate("certificationId", "name")
        .exec();

      const certificationMap = {};
      fallbackCounts.forEach((app) => {
        if (app.certificationId && app.certificationId.name) {
          const name = app.certificationId.name;
          certificationMap[name] = (certificationMap[name] || 0) + 1;
        }
      });

      return Object.entries(certificationMap)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([name, count]) => ({
          qualification: name,
          count,
        }));
    }

    return certificationCounts.map(({ _id, count }) => ({
      qualification: _id,
      count,
    }));
  } catch (error) {
    console.error("Error in getTopCertifications:", error);
    return [];
  }
}

async function calculateDetailedPaymentStats(startOfPeriod) {
  // Implementation for detailed payment statistics
  const paymentStats = await Payment.aggregate([
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
        totalAmount: { $sum: "$totalAmount" },
      },
    },
  ]);

  return paymentStats;
}

async function calculateAssessorAssignmentStats() {
  const assignedToAssessors = await Application.countDocuments({
    isArchived: { $ne: true },
    assignedAssessor: { $exists: true, $ne: null },
  });

  const unassignedApplications =
    (await Application.countDocuments({
      isArchived: { $ne: true },
      assignedAssessor: { $exists: false },
    })) +
    (await Application.countDocuments({
      isArchived: { $ne: true },
      assignedAssessor: null,
    }));

  return {
    assignedToAssessors,
    unassignedApplications,
  };
}

async function calculateAllTimeStats(agentId = null) {
  const allTimeRevenue = agentId
    ? 0
    : await Payment.aggregate([
        { $match: { status: "completed" } },
        { $group: { _id: null, total: { $sum: "$totalAmount" } } },
      ]);

  const baseQuery = { isArchived: { $ne: true } };
  if (agentId) {
    baseQuery.assignedAgent = agentId;
  }

  const allTimeApplications = await Application.countDocuments(baseQuery);

  const allTimeUsers = await User.countDocuments({
    isActive: true,
  });

  return {
    revenue: agentId ? 0 : allTimeRevenue[0]?.total || 0,
    applications: allTimeApplications,
    users: allTimeUsers,
  };
}

function formatPeriodLabel(date, period) {
  switch (period) {
    case "daily":
      return date.format("MMM DD");
    case "weekly":
      return date.format("MMM DD");
    case "monthly":
      return date.format("MMM YYYY");
    default:
      return date.format("MMM DD");
  }
}

module.exports = adminDashboardController;
