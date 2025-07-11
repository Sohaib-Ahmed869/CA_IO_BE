// controllers/forecastingController.js
const Payment = require("../models/payment");
const Application = require("../models/application");
const Certification = require("../models/certification");
const moment = require("moment");

const forecastingController = {
  // Get comprehensive forecasting data
  getProfitAnalysis: async (req, res) => {
    try {
      const { period = "monthly", year, month, quarter } = req.query;

      const startOfPeriod = getStartOfPeriod(period, year, month, quarter);
      const endOfPeriod = getEndOfPeriod(period, year, month, quarter);

      // Get all payments with certification and expense data
      const payments = await Payment.find({
        createdAt: {
          $gte: startOfPeriod.toDate(),
          $lte: endOfPeriod.toDate(),
        },
      })
        .populate("certificationId", "name price baseExpense")
        .populate("applicationId", "overallStatus");

      const profitMetrics = await calculateProfitMetrics(
        payments,
        period,
        startOfPeriod,
        endOfPeriod
      );
      const profitByCertification = await calculateProfitByCertification(
        payments
      );
      const profitTrends = await calculateProfitTrends(period, startOfPeriod);

      res.json({
        success: true,
        data: {
          period,
          periodRange: {
            start: startOfPeriod.format("YYYY-MM-DD"),
            end: endOfPeriod.format("YYYY-MM-DD"),
          },
          profitMetrics,
          profitByCertification,
          profitTrends,
          lastUpdated: new Date(),
        },
      });
    } catch (error) {
      console.error("Get profit analysis error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching profit analysis",
      });
    }
  },
  getForecastingData: async (req, res) => {
    try {
      const { period = "monthly", year, month, quarter } = req.query;

      const currentDate = moment();
      const startOfPeriod = getStartOfPeriod(period, year, month, quarter);
      const endOfPeriod = getEndOfPeriod(period, year, month, quarter);

      // Get all payments for analysis
      const allPayments = await Payment.find({})
        .populate("certificationId", "name price")
        .populate("applicationId", "overallStatus createdAt");

      // Calculate different revenue metrics
      const totalExpectedRevenue = await calculateTotalExpectedRevenue(
        period,
        startOfPeriod,
        endOfPeriod
      );
      const receivables = await calculateReceivables(
        period,
        startOfPeriod,
        endOfPeriod
      );
      const revenueBreakdown = await calculateRevenueBreakdown(
        allPayments,
        period,
        startOfPeriod,
        endOfPeriod
      );
      const paymentPlanMetrics = await calculatePaymentPlanMetrics(allPayments);
      const periodComparison = await calculatePeriodComparison(
        period,
        startOfPeriod
      );

      res.json({
        success: true,
        data: {
          period,
          periodRange: {
            start: startOfPeriod.format("YYYY-MM-DD"),
            end: endOfPeriod.format("YYYY-MM-DD"),
          },
          totalExpectedRevenue,
          receivables,
          revenueBreakdown,
          paymentPlanMetrics,
          periodComparison,
          lastUpdated: new Date(),
        },
      });
    } catch (error) {
      console.error("Get forecasting data error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching forecasting data",
      });
    }
  },

  // Get revenue trends over time
  getRevenueTrends: async (req, res) => {
    try {
      const { period = "monthly", periods = 12 } = req.query;

      const trends = [];
      const currentDate = moment();

      for (let i = periods - 1; i >= 0; i--) {
        let periodStart, periodEnd;

        if (period === "weekly") {
          periodStart = moment().subtract(i, "weeks").startOf("week");
          periodEnd = moment().subtract(i, "weeks").endOf("week");
        } else if (period === "monthly") {
          periodStart = moment().subtract(i, "months").startOf("month");
          periodEnd = moment().subtract(i, "months").endOf("month");
        } else if (period === "quarterly") {
          periodStart = moment()
            .subtract(i * 3, "months")
            .startOf("quarter");
          periodEnd = moment()
            .subtract(i * 3, "months")
            .endOf("quarter");
        } else if (period === "yearly") {
          periodStart = moment().subtract(i, "years").startOf("year");
          periodEnd = moment().subtract(i, "years").endOf("year");
        }

        const periodRevenue = await calculateRevenueForPeriod(
          periodStart,
          periodEnd
        );

        trends.push({
          period: periodStart.format("YYYY-MM-DD"),
          label: formatPeriodLabel(periodStart, period),
          actualRevenue: periodRevenue.actual,
          projectedRevenue: periodRevenue.projected,
          completedPayments: periodRevenue.completedPayments,
          pendingPayments: periodRevenue.pendingPayments,
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
      console.error("Get revenue trends error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching revenue trends",
      });
    }
  },

  // Get certification-wise forecasting
  getCertificationForecast: async (req, res) => {
    try {
      const { period = "monthly" } = req.query;

      const certifications = await Certification.find({ isActive: true });
      const forecastByCertification = [];

      for (const cert of certifications) {
        const certPayments = await Payment.find({
          certificationId: cert._id,
        }).populate("applicationId");

        const certMetrics = await calculateCertificationMetrics(
          certPayments,
          period
        );

        forecastByCertification.push({
          certification: {
            id: cert._id,
            name: cert.name,
            price: cert.price,
          },
          metrics: certMetrics,
        });
      }

      res.json({
        success: true,
        data: {
          forecastByCertification,
          period,
        },
      });
    } catch (error) {
      console.error("Get certification forecast error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching certification forecast",
      });
    }
  },

  // Get payment method analytics
  getPaymentMethodAnalytics: async (req, res) => {
    try {
      const { period = "monthly" } = req.query;

      const startOfPeriod = getStartOfPeriod(period);
      const endOfPeriod = getEndOfPeriod(period);

      const paymentMethodStats = await Payment.aggregate([
        {
          $match: {
            createdAt: {
              $gte: startOfPeriod.toDate(),
              $lte: endOfPeriod.toDate(),
            },
          },
        },
        {
          $group: {
            _id: "$paymentType",
            count: { $sum: 1 },
            totalAmount: { $sum: "$totalAmount" },
            avgAmount: { $avg: "$totalAmount" },
            completedCount: {
              $sum: {
                $cond: [{ $eq: ["$status", "completed"] }, 1, 0],
              },
            },
            pendingCount: {
              $sum: {
                $cond: [{ $eq: ["$status", "pending"] }, 1, 0],
              },
            },
          },
        },
      ]);

      res.json({
        success: true,
        data: {
          paymentMethodStats,
          period,
        },
      });
    } catch (error) {
      console.error("Get payment method analytics error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching payment method analytics",
      });
    }
  },
};

// Helper functions
function getStartOfPeriod(period, year, month, quarter) {
  const now = moment();

  switch (period) {
    case "weekly":
      return now.startOf("week");
    case "monthly":
      if (year && month) {
        return moment(`${year}-${month}-01`).startOf("month");
      }
      return now.startOf("month");
    case "quarterly":
      if (year && quarter) {
        return moment(`${year}-${(quarter - 1) * 3 + 1}-01`).startOf("quarter");
      }
      return now.startOf("quarter");
    case "yearly":
      if (year) {
        return moment(`${year}-01-01`).startOf("year");
      }
      return now.startOf("year");
    default:
      return now.startOf("month");
  }
}

function getEndOfPeriod(period, year, month, quarter) {
  const startOfPeriod = getStartOfPeriod(period, year, month, quarter);

  switch (period) {
    case "weekly":
      return startOfPeriod.clone().endOf("week");
    case "monthly":
      return startOfPeriod.clone().endOf("month");
    case "quarterly":
      return startOfPeriod.clone().endOf("quarter");
    case "yearly":
      return startOfPeriod.clone().endOf("year");
    default:
      return startOfPeriod.clone().endOf("month");
  }
}

async function calculateTotalExpectedRevenue(
  period,
  startOfPeriod,
  endOfPeriod
) {
  // Completed revenue in the period
  const completedRevenue = await Payment.aggregate([
    {
      $match: {
        status: "completed",
        completedAt: {
          $gte: startOfPeriod.toDate(),
          $lte: endOfPeriod.toDate(),
        },
      },
    },
    {
      $group: {
        _id: null,
        total: { $sum: "$totalAmount" },
        count: { $sum: 1 },
      },
    },
  ]);

  // Projected revenue from pending payments
  const pendingRevenue = await Payment.aggregate([
    {
      $match: {
        status: { $in: ["pending", "processing"] },
      },
    },
    {
      $group: {
        _id: null,
        total: { $sum: "$totalAmount" },
        count: { $sum: 1 },
      },
    },
  ]);

  // Revenue from payment plans (future installments)
  const paymentPlanRevenue = await calculatePaymentPlanRevenue(
    startOfPeriod,
    endOfPeriod
  );

  return {
    completed: completedRevenue[0]?.total || 0,
    completedCount: completedRevenue[0]?.count || 0,
    pending: pendingRevenue[0]?.total || 0,
    pendingCount: pendingRevenue[0]?.count || 0,
    paymentPlans: paymentPlanRevenue,
    total:
      (completedRevenue[0]?.total || 0) +
      (pendingRevenue[0]?.total || 0) +
      paymentPlanRevenue.total,
  };
}

async function calculateReceivables(period, startOfPeriod, endOfPeriod) {
  const receivables = {
    overdue: { amount: 0, count: 0, payments: [] },
    currentWeek: { amount: 0, count: 0, payments: [] },
    next30Days: { amount: 0, count: 0, payments: [] },
    next90Days: { amount: 0, count: 0, payments: [] },
    future: { amount: 0, count: 0, payments: [] },
  };

  // Get all payment plans with future payments
  const paymentPlans = await Payment.find({
    paymentType: "payment_plan",
    status: { $in: ["processing", "pending"] },
  }).populate("applicationId certificationId");

  const now = moment();

  for (const payment of paymentPlans) {
    const futurePayments = calculateFuturePayments(payment);

    for (const futurePayment of futurePayments) {
      const dueDate = moment(futurePayment.dueDate);
      const category = categorizeDueDate(dueDate, now);

      receivables[category].amount += futurePayment.amount;
      receivables[category].count += 1;
      receivables[category].payments.push({
        paymentId: payment._id,
        applicationId: payment.applicationId._id,
        certificationName: payment.certificationId.name,
        amount: futurePayment.amount,
        dueDate: futurePayment.dueDate,
        installmentNumber: futurePayment.installmentNumber,
      });
    }
  }

  return receivables;
}

async function calculateRevenueBreakdown(
  allPayments,
  period,
  startOfPeriod,
  endOfPeriod
) {
  const breakdown = {
    byPaymentType: {
      oneTime: { amount: 0, count: 0 },
      paymentPlan: { amount: 0, count: 0 },
    },
    byStatus: {
      completed: { amount: 0, count: 0 },
      pending: { amount: 0, count: 0 },
      processing: { amount: 0, count: 0 },
      failed: { amount: 0, count: 0 },
      cancelled: { amount: 0, count: 0 },
    },
    byCertification: {},
  };

  const periodPayments = allPayments.filter((payment) => {
    const paymentDate = moment(payment.createdAt);
    return paymentDate.isBetween(startOfPeriod, endOfPeriod, null, "[]");
  });

  for (const payment of periodPayments) {
    // By payment type
    if (payment.paymentType === "one_time") {
      breakdown.byPaymentType.oneTime.amount += payment.totalAmount;
      breakdown.byPaymentType.oneTime.count += 1;
    } else {
      breakdown.byPaymentType.paymentPlan.amount += payment.totalAmount;
      breakdown.byPaymentType.paymentPlan.count += 1;
    }

    // By status
    if (breakdown.byStatus[payment.status]) {
      breakdown.byStatus[payment.status].amount += payment.totalAmount;
      breakdown.byStatus[payment.status].count += 1;
    }

    // By certification
    const certName = payment.certificationId?.name || "Unknown";
    if (!breakdown.byCertification[certName]) {
      breakdown.byCertification[certName] = { amount: 0, count: 0 };
    }
    breakdown.byCertification[certName].amount += payment.totalAmount;
    breakdown.byCertification[certName].count += 1;
  }

  return breakdown;
}

async function calculatePaymentPlanMetrics(allPayments) {
  const paymentPlans = allPayments.filter(
    (p) => p.paymentType === "payment_plan"
  );

  const metrics = {
    totalPlans: paymentPlans.length,
    activePlans: paymentPlans.filter((p) => p.status === "processing").length,
    completedPlans: paymentPlans.filter((p) => p.status === "completed").length,
    averageCompletionRate: 0,
    totalRecurringRevenue: 0,
    monthlyRecurringRevenue: 0,
  };

  let totalCompletionSum = 0;
  for (const plan of paymentPlans) {
    if (plan.paymentPlan && plan.paymentPlan.recurringPayments) {
      const completionRate =
        (plan.paymentPlan.recurringPayments.completedPayments /
          plan.paymentPlan.recurringPayments.totalPayments) *
        100;
      totalCompletionSum += completionRate;

      metrics.totalRecurringRevenue += plan.totalAmount;

      if (plan.status === "processing") {
        metrics.monthlyRecurringRevenue +=
          plan.paymentPlan.recurringPayments.amount;
      }
    }
  }

  if (paymentPlans.length > 0) {
    metrics.averageCompletionRate = totalCompletionSum / paymentPlans.length;
  }

  return metrics;
}

async function calculatePeriodComparison(period, currentStart) {
  let previousStart, previousEnd;

  switch (period) {
    case "weekly":
      previousStart = currentStart.clone().subtract(1, "week");
      previousEnd = previousStart.clone().endOf("week");
      break;
    case "monthly":
      previousStart = currentStart.clone().subtract(1, "month");
      previousEnd = previousStart.clone().endOf("month");
      break;
    case "quarterly":
      previousStart = currentStart.clone().subtract(3, "months");
      previousEnd = previousStart.clone().endOf("quarter");
      break;
    case "yearly":
      previousStart = currentStart.clone().subtract(1, "year");
      previousEnd = previousStart.clone().endOf("year");
      break;
  }

  const currentRevenue = await calculateRevenueForPeriod(
    currentStart,
    currentStart.clone().endOf(period.slice(0, -2))
  );
  const previousRevenue = await calculateRevenueForPeriod(
    previousStart,
    previousEnd
  );

  const growth =
    previousRevenue.actual > 0
      ? ((currentRevenue.actual - previousRevenue.actual) /
          previousRevenue.actual) *
        100
      : 0;

  return {
    current: currentRevenue,
    previous: previousRevenue,
    growth: growth,
    growthDirection: growth > 0 ? "up" : growth < 0 ? "down" : "stable",
  };
}

async function calculateRevenueForPeriod(startDate, endDate) {
  const completedPayments = await Payment.find({
    status: "completed",
    completedAt: {
      $gte: startDate.toDate(),
      $lte: endDate.toDate(),
    },
  });

  const pendingPayments = await Payment.find({
    status: { $in: ["pending", "processing"] },
    createdAt: {
      $gte: startDate.toDate(),
      $lte: endDate.toDate(),
    },
  });

  const actualRevenue = completedPayments.reduce(
    (sum, p) => sum + p.totalAmount,
    0
  );
  const projectedRevenue = pendingPayments.reduce(
    (sum, p) => sum + p.totalAmount,
    0
  );

  return {
    actual: actualRevenue,
    projected: projectedRevenue,
    total: actualRevenue + projectedRevenue,
    completedPayments: completedPayments.length,
    pendingPayments: pendingPayments.length,
  };
}

function calculateFuturePayments(payment) {
  const futurePayments = [];

  if (!payment.paymentPlan || !payment.paymentPlan.recurringPayments) {
    return futurePayments;
  }

  const { completedPayments, totalPayments, amount, frequency } =
    payment.paymentPlan.recurringPayments;
  const remainingPayments = totalPayments - completedPayments;

  let nextPaymentDate = moment(payment.createdAt);

  // Calculate next payment date based on completed payments
  for (let i = 0; i < completedPayments; i++) {
    if (frequency === "weekly") {
      nextPaymentDate.add(1, "week");
    } else if (frequency === "monthly") {
      nextPaymentDate.add(1, "month");
    }
  }

  // Generate future payment schedule
  for (let i = 0; i < remainingPayments; i++) {
    if (frequency === "weekly") {
      nextPaymentDate.add(1, "week");
    } else if (frequency === "monthly") {
      nextPaymentDate.add(1, "month");
    }

    futurePayments.push({
      dueDate: nextPaymentDate.clone().toDate(),
      amount: amount,
      installmentNumber: completedPayments + i + 1,
    });
  }

  return futurePayments;
}

function categorizeDueDate(dueDate, now) {
  const daysDiff = dueDate.diff(now, "days");

  if (daysDiff < 0) return "overdue";
  if (daysDiff <= 7) return "currentWeek";
  if (daysDiff <= 30) return "next30Days";
  if (daysDiff <= 90) return "next90Days";
  return "future";
}

async function calculatePaymentPlanRevenue(startOfPeriod, endOfPeriod) {
  const paymentPlans = await Payment.find({
    paymentType: "payment_plan",
    status: { $in: ["processing", "pending"] },
  });

  let totalFutureRevenue = 0;
  let totalScheduledPayments = 0;

  for (const payment of paymentPlans) {
    const futurePayments = calculateFuturePayments(payment);
    const periodPayments = futurePayments.filter((fp) => {
      const paymentDate = moment(fp.dueDate);
      return paymentDate.isBetween(startOfPeriod, endOfPeriod, null, "[]");
    });

    totalFutureRevenue += periodPayments.reduce((sum, p) => sum + p.amount, 0);
    totalScheduledPayments += periodPayments.length;
  }

  return {
    total: totalFutureRevenue,
    count: totalScheduledPayments,
  };
}

async function calculateCertificationMetrics(certPayments, period) {
  const completed = certPayments.filter((p) => p.status === "completed");
  const pending = certPayments.filter(
    (p) => p.status === "pending" || p.status === "processing"
  );

  return {
    totalRevenue: completed.reduce((sum, p) => sum + p.totalAmount, 0),
    projectedRevenue: pending.reduce((sum, p) => sum + p.totalAmount, 0),
    completedCount: completed.length,
    pendingCount: pending.length,
    averageAmount:
      completed.length > 0
        ? completed.reduce((sum, p) => sum + p.totalAmount, 0) /
          completed.length
        : 0,
  };
}

function formatPeriodLabel(date, period) {
  switch (period) {
    case "weekly":
      return date.format("MMM DD, YYYY");
    case "monthly":
      return date.format("MMM YYYY");
    case "quarterly":
      return `Q${date.quarter()} ${date.format("YYYY")}`;
    case "yearly":
      return date.format("YYYY");
    default:
      return date.format("MMM YYYY");
  }
}
// Add these helper functions at the bottom of forecastingController.js

async function calculateProfitMetrics(
  payments,
  period,
  startOfPeriod,
  endOfPeriod
) {
  let totalRevenue = 0;
  let totalExpenses = 0;
  let totalProfit = 0;
  let completedPayments = 0;
  let pendingRevenue = 0;
  let pendingExpenses = 0;

  for (const payment of payments) {
    const revenue = payment.totalAmount || 0;
    const expense = payment.certificationId?.baseExpense || 0;
    const profit = revenue - expense;

    if (payment.status === "completed") {
      totalRevenue += revenue;
      totalExpenses += expense;
      totalProfit += profit;
      completedPayments++;
    } else if (
      payment.status === "pending" ||
      payment.status === "processing"
    ) {
      pendingRevenue += revenue;
      pendingExpenses += expense;
    }
  }

  const profitMargin =
    totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
  const projectedProfit = pendingRevenue - pendingExpenses;

  return {
    totalRevenue,
    totalExpenses,
    totalProfit,
    profitMargin: parseFloat(profitMargin.toFixed(2)),
    completedPayments,
    pendingRevenue,
    pendingExpenses,
    projectedProfit,
    totalProjectedProfit: totalProfit + projectedProfit,
    averageProfitPerPayment:
      completedPayments > 0 ? totalProfit / completedPayments : 0,
  };
}

async function calculateProfitByCertification(payments) {
  const certificationProfits = {};

  for (const payment of payments) {
    const certId = payment.certificationId?._id?.toString();
    const certName = payment.certificationId?.name || "Unknown";

    if (!certificationProfits[certId]) {
      certificationProfits[certId] = {
        name: certName,
        revenue: 0,
        expenses: 0,
        profit: 0,
        count: 0,
        completedCount: 0,
        averageProfit: 0,
        profitMargin: 0,
      };
    }

    const revenue = payment.totalAmount || 0;
    const expense = payment.certificationId?.baseExpense || 0;
    const profit = revenue - expense;

    certificationProfits[certId].revenue += revenue;
    certificationProfits[certId].expenses += expense;
    certificationProfits[certId].profit += profit;
    certificationProfits[certId].count++;

    if (payment.status === "completed") {
      certificationProfits[certId].completedCount++;
    }
  }

  // Calculate averages and margins
  Object.values(certificationProfits).forEach((cert) => {
    cert.averageProfit =
      cert.completedCount > 0 ? cert.profit / cert.completedCount : 0;
    cert.profitMargin =
      cert.revenue > 0 ? (cert.profit / cert.revenue) * 100 : 0;
    cert.profitMargin = parseFloat(cert.profitMargin.toFixed(2));
  });

  return Object.values(certificationProfits);
}

async function calculateProfitTrends(period, currentStart) {
  const trends = [];

  for (let i = 5; i >= 0; i--) {
    let periodStart, periodEnd;

    if (period === "weekly") {
      periodStart = moment().subtract(i, "weeks").startOf("week");
      periodEnd = moment().subtract(i, "weeks").endOf("week");
    } else if (period === "monthly") {
      periodStart = moment().subtract(i, "months").startOf("month");
      periodEnd = moment().subtract(i, "months").endOf("month");
    } else if (period === "quarterly") {
      periodStart = moment()
        .subtract(i * 3, "months")
        .startOf("quarter");
      periodEnd = moment()
        .subtract(i * 3, "months")
        .endOf("quarter");
    } else {
      periodStart = moment().subtract(i, "years").startOf("year");
      periodEnd = moment().subtract(i, "years").endOf("year");
    }

    const periodPayments = await Payment.find({
      status: "completed",
      completedAt: {
        $gte: periodStart.toDate(),
        $lte: periodEnd.toDate(),
      },
    }).populate("certificationId", "baseExpense");

    const periodMetrics = await calculateProfitMetrics(
      periodPayments,
      period,
      periodStart,
      periodEnd
    );

    trends.push({
      period: periodStart.format("YYYY-MM-DD"),
      label: formatPeriodLabel(periodStart, period),
      revenue: periodMetrics.totalRevenue,
      expenses: periodMetrics.totalExpenses,
      profit: periodMetrics.totalProfit,
      profitMargin: periodMetrics.profitMargin,
    });
  }

  return trends;
}

module.exports = forecastingController;
