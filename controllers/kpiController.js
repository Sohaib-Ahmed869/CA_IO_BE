// controllers/kpiController.js
const User = require("../models/user");
const Application = require("../models/application");
const Payment = require("../models/payment");

const kpiController = {
  // Get all KPIs for dashboard
  getAllKPIs: async (req, res) => {
    try {
      const { period = 'lastWeek' } = req.query;
      
      // Calculate date range based on period
      const now = new Date();
      let startDate;
      
      if (period === 'allTime') {
        // For all time, use a very old date
        startDate = new Date('2020-01-01');
      } else {
        const periodMap = {
          lastWeek: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
          lastMonth: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
          lastQuarter: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000),
          lastYear: new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000)
        };
        startDate = periodMap[period];
      }

      if (!startDate && period !== 'allTime') {
        return res.status(400).json({
          success: false,
          message: "Invalid period. Use: lastWeek, lastMonth, lastQuarter, lastYear, allTime"
        });
      }

      // No RTO filtering - get global data
      const baseFilters = {};

      // Get all KPIs for the specified period
      const [
        newUsers,
        newApplications,
        completedApplications,
        revenueData,
        allCompletedPayments,
        allCompletedApplications,
        // Step-wise application counts
        step1Applications,
        step2Applications,
        step3Applications,
        step4Applications,
        step5Applications,
        step6Applications,
        step7Applications,
        step8Applications,
        step9Applications,
        step10Applications,
        // Status-wise application counts
        initialScreeningApps,
        paymentPendingApps,
        paymentCompletedApps,
        inProgressApps,
        underReviewApps,
        assessmentPendingApps,
        assessmentCompletedApps,
        certificateIssuedApps,
        rejectedApps
      ] = await Promise.all([
        // New Users
        User.countDocuments({ ...baseFilters, createdAt: { $gte: startDate } }),
        
        // New Applications
        Application.countDocuments({ ...baseFilters, createdAt: { $gte: startDate } }),
        
        // Completed Applications (using completedAt field)
        Application.countDocuments({ ...baseFilters, overallStatus: 'completed', completedAt: { $gte: startDate } }),
        
        // Revenue (using createdAt field)
        Payment.aggregate([
          { $match: { ...baseFilters, status: 'completed', createdAt: { $gte: startDate } } },
          { $group: { _id: null, total: { $sum: '$totalAmount' } } }
        ]),
        
        // All completed payments for debugging
        Payment.countDocuments({ ...baseFilters, status: 'completed' }),
        
        // All completed applications for debugging
        Application.countDocuments({ ...baseFilters, overallStatus: 'completed' }),
        
        // Step-wise counts (currentStep field)
        Application.countDocuments({ ...baseFilters, currentStep: 1 }),
        Application.countDocuments({ ...baseFilters, currentStep: 2 }),
        Application.countDocuments({ ...baseFilters, currentStep: 3 }),
        Application.countDocuments({ ...baseFilters, currentStep: 4 }),
        Application.countDocuments({ ...baseFilters, currentStep: 5 }),
        Application.countDocuments({ ...baseFilters, currentStep: 6 }),
        Application.countDocuments({ ...baseFilters, currentStep: 7 }),
        Application.countDocuments({ ...baseFilters, currentStep: 8 }),
        Application.countDocuments({ ...baseFilters, currentStep: 9 }),
        Application.countDocuments({ ...baseFilters, currentStep: 10 }),
        
        // Status-wise counts (overallStatus field)
        Application.countDocuments({ ...baseFilters, overallStatus: 'initial_screening' }),
        Application.countDocuments({ ...baseFilters, overallStatus: 'payment_pending' }),
        Application.countDocuments({ ...baseFilters, overallStatus: 'payment_completed' }),
        Application.countDocuments({ ...baseFilters, overallStatus: 'in_progress' }),
        Application.countDocuments({ ...baseFilters, overallStatus: 'under_review' }),
        Application.countDocuments({ ...baseFilters, overallStatus: 'assessment_pending' }),
        Application.countDocuments({ ...baseFilters, overallStatus: 'assessment_completed' }),
        Application.countDocuments({ ...baseFilters, overallStatus: 'certificate_issued' }),
        Application.countDocuments({ ...baseFilters, overallStatus: 'rejected' })
      ]);

      // Get paid users (users with successful payments in the period)
      const paidUserIds = await Payment.distinct('userId', {
        ...baseFilters,
        status: 'completed',
        createdAt: { $gte: startDate }
      });
      const paidUsers = paidUserIds.length;

      // Calculate revenue
      const revenue = revenueData.length > 0 ? revenueData[0].total : 0;

      // Calculate conversion and completion rates
      const conversionRate = newApplications > 0 ? (paidUsers / newApplications * 100).toFixed(2) : 0;
      const completionRate = newApplications > 0 ? (completedApplications / newApplications * 100).toFixed(2) : 0;

      const kpis = {
        period: period,
        periodLabel: {
          lastWeek: "Last 7 Days",
          lastMonth: "Last 30 Days", 
          lastQuarter: "Last 90 Days",
          lastYear: "Last 365 Days",
          allTime: "All Time (From 2020)"
        }[period],
        
        // Core Metrics
        newUsers: newUsers,
        newApplications: newApplications,
        paidUsers: paidUsers,
        completedApplications: completedApplications,
        revenue: revenue,
        
        // Calculated Rates
        conversionRate: parseFloat(conversionRate),
        completionRate: parseFloat(completionRate),
        
        // Additional Metrics
        averageRevenuePerUser: paidUsers > 0 ? (revenue / paidUsers).toFixed(2) : 0,
        averageRevenuePerApplication: newApplications > 0 ? (revenue / newApplications).toFixed(2) : 0,
        
        // Step-wise Application Distribution
        stepDistribution: {
          step1: step1Applications,
          step2: step2Applications,
          step3: step3Applications,
          step4: step4Applications,
          step5: step5Applications,
          step6: step6Applications,
          step7: step7Applications,
          step8: step8Applications,
          step9: step9Applications,
          step10: step10Applications,
          total: step1Applications + step2Applications + step3Applications + step4Applications + step5Applications + step6Applications + step7Applications + step8Applications + step9Applications + step10Applications
        },
        
        // Status-wise Application Distribution
        statusDistribution: {
          initialScreening: initialScreeningApps,
          paymentPending: paymentPendingApps,
          paymentCompleted: paymentCompletedApps,
          inProgress: inProgressApps,
          underReview: underReviewApps,
          assessmentPending: assessmentPendingApps,
          assessmentCompleted: assessmentCompletedApps,
          certificateIssued: certificateIssuedApps,
          rejected: rejectedApps,
          total: initialScreeningApps + paymentPendingApps + paymentCompletedApps + inProgressApps + underReviewApps + assessmentPendingApps + assessmentCompletedApps + certificateIssuedApps + rejectedApps
        },
        
        // Debug Information
        debug: {
          allCompletedPaymentsInDB: allCompletedPayments,
          allCompletedApplicationsInDB: allCompletedApplications,
          dateRange: {
            startDate: startDate.toISOString(),
            endDate: now.toISOString()
          }
        },
        
        // Metadata
        generatedAt: new Date().toISOString()
      };

      console.log("KPIs retrieved successfully", {
        period,
        newUsers,
        newApplications,
        paidUsers,
        completedApplications,
        revenue,
        stepDistribution: {
          step1: step1Applications,
          step2: step2Applications,
          step3: step3Applications,
          step4: step4Applications,
          step5: step5Applications
        },
        statusDistribution: {
          paymentPending: paymentPendingApps,
          paymentCompleted: paymentCompletedApps,
          inProgress: inProgressApps,
          completed: completedApplications
        },
        allCompletedPaymentsInDB: allCompletedPayments,
        allCompletedApplicationsInDB: allCompletedApplications,
        dateRange: {
          startDate: startDate.toISOString(),
          endDate: now.toISOString()
        }
      });

      res.json({
        success: true,
        message: "KPIs retrieved successfully",
        data: kpis
      });

    } catch (error) {
      console.error("KPI error:", error);
      res.status(500).json({
        success: false,
        message: "Error retrieving KPIs",
        error: error.message
      });
    }
  }
};

module.exports = kpiController;
