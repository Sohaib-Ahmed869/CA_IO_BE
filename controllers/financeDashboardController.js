// controllers/financeDashboardController.js
const Payment = require("../models/payment");
const Application = require("../models/application");
const Certification = require("../models/certification");
const moment = require("moment");

const financeDashboardController = {
  // Get finance dashboard data
  getFinanceDashboard: async (req, res) => {
    try {
      const { period = "monthly", year, month, quarter, startDate, endDate } = req.query;

      let startOfPeriod, endOfPeriod;

      // Custom date range
      if (startDate && endDate) {
        startOfPeriod = moment(startDate);
        endOfPeriod = moment(endDate);
      } else {
        // Standard period calculation
        startOfPeriod = getStartOfPeriod(period, year, month, quarter);
        endOfPeriod = getEndOfPeriod(period, year, month, quarter);
      }

      const financeData = await calculateFinanceData(startOfPeriod, endOfPeriod, period);

      res.json({
        success: true,
        data: {
          period,
          periodRange: {
            start: startOfPeriod.format("YYYY-MM-DD"),
            end: endOfPeriod.format("YYYY-MM-DD"),
          },
          ...financeData,
          lastUpdated: new Date(),
        },
      });
    } catch (error) {
      console.error("Get finance dashboard error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching finance dashboard data",
        error: error.message,
      });
    }
  },

  // Export finance data to CSV
  exportFinanceCSV: async (req, res) => {
    try {
      const { period = "monthly", year, month, quarter, startDate, endDate, format = "detailed" } = req.query;

      let startOfPeriod, endOfPeriod;

      // Custom date range
      if (startDate && endDate) {
        startOfPeriod = moment(startDate);
        endOfPeriod = moment(endDate);
      } else {
        startOfPeriod = getStartOfPeriod(period, year, month, quarter);
        endOfPeriod = getEndOfPeriod(period, year, month, quarter);
      }

      // Get detailed data for CSV
      const csvData = await generateFinanceCSVData(startOfPeriod, endOfPeriod, period, format);

      // Set headers for CSV download
      res.setHeader("Content-Type", "text/csv");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="finance-dashboard-${period}-${moment().format("YYYY-MM-DD")}.csv"`
      );

      res.send(csvData);
    } catch (error) {
      console.error("Export finance CSV error:", error);
      res.status(500).json({
        success: false,
        message: "Error exporting finance data to CSV",
        error: error.message,
      });
    }
  },
};

// Helper function to get start of period
function getStartOfPeriod(period, year, month, quarter) {
  const now = moment();

  switch (period) {
    case "weekly":
      return moment().startOf("week");
    case "monthly":
      if (year && month) {
        return moment(`${year}-${month}-01`).startOf("month");
      }
      return now.startOf("month");
    case "quarterly":
      if (year && quarter) {
        const quarterStartMonth = (quarter - 1) * 3;
        return moment(`${year}-${quarterStartMonth + 1}-01`).startOf("month");
      }
      return now.startOf("quarter");
    case "annually":
    case "yearly":
      if (year) {
        return moment(`${year}-01-01`).startOf("year");
      }
      return now.startOf("year");
    default:
      return now.startOf("month");
  }
}

// Helper function to get end of period
function getEndOfPeriod(period, year, month, quarter) {
  const now = moment();

  switch (period) {
    case "weekly":
      return moment().endOf("week");
    case "monthly":
      if (year && month) {
        return moment(`${year}-${month}-01`).endOf("month");
      }
      return now.endOf("month");
    case "quarterly":
      if (year && quarter) {
        const quarterStartMonth = (quarter - 1) * 3;
        return moment(`${year}-${quarterStartMonth + 1}-01`).endOf("quarter");
      }
      return now.endOf("quarter");
    case "annually":
    case "yearly":
      if (year) {
        return moment(`${year}-01-01`).endOf("year");
      }
      return now.endOf("year");
    default:
      return now.endOf("month");
  }
}

// Calculate finance data for a period
async function calculateFinanceData(startOfPeriod, endOfPeriod, period) {
  // Get all payments in the period
  const payments = await Payment.find({
    $or: [
      {
        // Completed payments - use completedAt
        status: "completed",
        completedAt: {
          $gte: startOfPeriod.toDate(),
          $lte: endOfPeriod.toDate(),
        },
      },
      {
        // Pending/processing payments - use createdAt for projection
        status: { $in: ["pending", "processing"] },
        createdAt: {
          $gte: startOfPeriod.toDate(),
          $lte: endOfPeriod.toDate(),
        },
      },
    ],
  })
    .populate("certificationId", "name price baseExpense")
    .populate("applicationId", "overallStatus appCode")
    .populate("userId", "firstName lastName email");

  let totalRevenue = 0;
  let totalExpenses = 0;
  let totalProfit = 0;
  let projectedRevenue = 0;
  let projectedExpenses = 0;
  let projectedProfit = 0;
  let completedPaymentsCount = 0;
  let pendingPaymentsCount = 0;

  // Calculate metrics
  for (const payment of payments) {
    const revenue = payment.totalAmount || 0;
    const expense = payment.certificationId?.baseExpense || 0;
    const profit = revenue - expense;

    if (payment.status === "completed") {
      totalRevenue += revenue;
      totalExpenses += expense;
      totalProfit += profit;
      completedPaymentsCount++;
    } else if (payment.status === "pending" || payment.status === "processing") {
      projectedRevenue += revenue;
      projectedExpenses += expense;
      projectedProfit += profit;
      pendingPaymentsCount++;
    }
  }

  // Calculate profit margin
  const profitMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
  const projectedProfitMargin =
    projectedRevenue > 0 ? (projectedProfit / projectedRevenue) * 100 : 0;

  // Calculate total projected (completed + pending)
  const totalProjectedRevenue = totalRevenue + projectedRevenue;
  const totalProjectedExpenses = totalExpenses + projectedExpenses;
  const totalProjectedProfit = totalProfit + projectedProfit;
  const totalProjectedProfitMargin =
    totalProjectedRevenue > 0 ? (totalProjectedProfit / totalProjectedRevenue) * 100 : 0;

  return {
    totalRevenue: parseFloat(totalRevenue.toFixed(2)),
    totalExpenses: parseFloat(totalExpenses.toFixed(2)),
    totalProfit: parseFloat(totalProfit.toFixed(2)),
    profitMargin: parseFloat(profitMargin.toFixed(2)),
    projectedRevenue: parseFloat(projectedRevenue.toFixed(2)),
    projectedExpenses: parseFloat(projectedExpenses.toFixed(2)),
    projectedProfit: parseFloat(projectedProfit.toFixed(2)),
    projectedProfitMargin: parseFloat(projectedProfitMargin.toFixed(2)),
    totalProjectedRevenue: parseFloat(totalProjectedRevenue.toFixed(2)),
    totalProjectedExpenses: parseFloat(totalProjectedExpenses.toFixed(2)),
    totalProjectedProfit: parseFloat(totalProjectedProfit.toFixed(2)),
    totalProjectedProfitMargin: parseFloat(totalProjectedProfitMargin.toFixed(2)),
    completedPaymentsCount,
    pendingPaymentsCount,
    totalPaymentsCount: completedPaymentsCount + pendingPaymentsCount,
    averageProfitPerPayment:
      completedPaymentsCount > 0
        ? parseFloat((totalProfit / completedPaymentsCount).toFixed(2))
        : 0,
  };
}

// Generate CSV data
async function generateFinanceCSVData(startOfPeriod, endOfPeriod, period, format) {
  // Get all payments in the period
  const payments = await Payment.find({
    $or: [
      {
        status: "completed",
        completedAt: {
          $gte: startOfPeriod.toDate(),
          $lte: endOfPeriod.toDate(),
        },
      },
      {
        status: { $in: ["pending", "processing"] },
        createdAt: {
          $gte: startOfPeriod.toDate(),
          $lte: endOfPeriod.toDate(),
        },
      },
    ],
  })
    .populate("certificationId", "name price baseExpense")
    .populate("applicationId", "overallStatus appCode")
    .populate("userId", "firstName lastName email")
    .sort({ createdAt: -1 });

  if (format === "summary") {
    // Summary format - aggregated data
    const financeData = await calculateFinanceData(startOfPeriod, endOfPeriod, period);
    
    const csvRows = [
      ["Finance Dashboard Summary"],
      [`Period: ${period}`],
      [`Date Range: ${startOfPeriod.format("YYYY-MM-DD")} to ${endOfPeriod.format("YYYY-MM-DD")}`],
      [`Generated: ${moment().format("YYYY-MM-DD HH:mm:ss")}`],
      [""],
      ["Metric", "Value"],
      ["Total Revenue", `$${financeData.totalRevenue.toFixed(2)}`],
      ["Total Expenses", `$${financeData.totalExpenses.toFixed(2)}`],
      ["Total Profit", `$${financeData.totalProfit.toFixed(2)}`],
      ["Profit Margin (%)", `${financeData.profitMargin.toFixed(2)}%`],
      [""],
      ["Projected Revenue", `$${financeData.projectedRevenue.toFixed(2)}`],
      ["Projected Expenses", `$${financeData.projectedExpenses.toFixed(2)}`],
      ["Projected Profit", `$${financeData.projectedProfit.toFixed(2)}`],
      ["Projected Profit Margin (%)", `${financeData.projectedProfitMargin.toFixed(2)}%`],
      [""],
      ["Total Projected Revenue", `$${financeData.totalProjectedRevenue.toFixed(2)}`],
      ["Total Projected Expenses", `$${financeData.totalProjectedExpenses.toFixed(2)}`],
      ["Total Projected Profit", `$${financeData.totalProjectedProfit.toFixed(2)}`],
      ["Total Projected Profit Margin (%)", `${financeData.totalProjectedProfitMargin.toFixed(2)}%`],
      [""],
      ["Completed Payments", financeData.completedPaymentsCount],
      ["Pending Payments", financeData.pendingPaymentsCount],
      ["Total Payments", financeData.totalPaymentsCount],
      ["Average Profit Per Payment", `$${financeData.averageProfitPerPayment.toFixed(2)}`],
    ];

    return csvRows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
  } else {
    // Detailed format - individual payment records
    const csvRows = [
      [
        "Payment ID",
        "Date",
        "Status",
        "Student Name",
        "Student Email",
        "Application Code",
        "Certification",
        "Payment Type",
        "Revenue",
        "Expense",
        "Profit",
        "Profit Margin (%)",
      ],
    ];

    for (const payment of payments) {
      const revenue = payment.totalAmount || 0;
      const expense = payment.certificationId?.baseExpense || 0;
      const profit = revenue - expense;
      const profitMargin = revenue > 0 ? (profit / revenue) * 100 : 0;
      const date = payment.status === "completed" && payment.completedAt
        ? moment(payment.completedAt).format("YYYY-MM-DD")
        : moment(payment.createdAt).format("YYYY-MM-DD");

      csvRows.push([
        payment._id.toString(),
        date,
        payment.status,
        payment.userId ? `${payment.userId.firstName} ${payment.userId.lastName}` : "N/A",
        payment.userId?.email || "N/A",
        payment.applicationId?.appCode || payment.applicationId?._id.toString() || "N/A",
        payment.certificationId?.name || "N/A",
        payment.paymentType,
        revenue.toFixed(2),
        expense.toFixed(2),
        profit.toFixed(2),
        profitMargin.toFixed(2),
      ]);
    }

    // Add summary rows at the end
    const financeData = await calculateFinanceData(startOfPeriod, endOfPeriod, period);
    csvRows.push([""]);
    csvRows.push(["SUMMARY"]);
    csvRows.push(["Total Revenue", `$${financeData.totalRevenue.toFixed(2)}`]);
    csvRows.push(["Total Expenses", `$${financeData.totalExpenses.toFixed(2)}`]);
    csvRows.push(["Total Profit", `$${financeData.totalProfit.toFixed(2)}`]);
    csvRows.push(["Profit Margin (%)", `${financeData.profitMargin.toFixed(2)}%`]);
    csvRows.push(["Projected Revenue", `$${financeData.projectedRevenue.toFixed(2)}`]);
    csvRows.push(["Projected Expenses", `$${financeData.projectedExpenses.toFixed(2)}`]);
    csvRows.push(["Projected Profit", `$${financeData.projectedProfit.toFixed(2)}`]);
    csvRows.push(["Total Projected Profit", `$${financeData.totalProjectedProfit.toFixed(2)}`]);

    return csvRows.map((row) => row.map((cell) => `"${cell}"`).join(",")).join("\n");
  }
}

module.exports = financeDashboardController;

