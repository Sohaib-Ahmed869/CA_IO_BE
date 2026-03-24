// controllers/reportingController.js
const Application = require("../models/application");
const Payment = require("../models/payment");
const User = require("../models/user");
const Certificate = require("../models/certificate");
const moment = require("moment");

const reportingController = {
  // Get all reporting data - NO AUTHENTICATION REQUIRED
  getReportingData: async (req, res) => {
    try {
      // Get number of new applications (last 30 days)
      const thirtyDaysAgo = moment().subtract(30, "days").toDate();
      const newApplications = await Application.countDocuments({
        createdAt: { $gte: thirtyDaysAgo },
      });

      // Get total applications all time
      const totalApplications = await Application.countDocuments();

      // Get application status breakdown
      const applicationStatuses = await Application.aggregate([
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 },
          },
        },
      ]);

      // Get number of unpaid payments
      const unpaidPayments = await Payment.countDocuments({
        status: { $in: ["pending", "processing"] },
      });

      // Get total payment statistics
      const totalPayments = await Payment.countDocuments();
      const paymentStats = await Payment.aggregate([
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 },
            totalAmount: { $sum: "$totalAmount" },
          },
        },
      ]);

      // Get all students count
      const totalStudents = await User.countDocuments({
        userType: "user",
      });

      // Get student breakdown by enrollment status
      const studentsByStatus = await Application.aggregate([
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 },
          },
        },
      ]);

      // Calculate average applications per student
      const avgApplicationsPerStudent =
        totalStudents > 0 ? (totalApplications / totalStudents).toFixed(2) : 0;

      // Get certificates generated
      const certificatesGenerated = await Certificate.countDocuments();

      // Get recent 30 days payment data
      const recentPaymentStats = await Payment.aggregate([
        {
          $match: {
            createdAt: { $gte: thirtyDaysAgo },
          },
        },
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 },
            totalAmount: { $sum: "$totalAmount" },
          },
        },
      ]);

      // Get admin users count
      const adminUsers = await User.countDocuments({
        userType: { $in: ["admin", "super_admin"] },
      });

      // Get assessor users count
      const assessorUsers = await User.countDocuments({
        userType: "assessor",
      });

      // Get payment plan vs one time breakdown
      const paymentTypeBreakdown = await Payment.aggregate([
        {
          $group: {
            _id: "$paymentType",
            count: { $sum: 1 },
            totalAmount: { $sum: "$totalAmount" },
          },
        },
      ]);

      // Calculate application completion rate
      const completedApplications = await Application.countDocuments({
        status: "completed",
      });
      const completionRate =
        totalApplications > 0
          ? ((completedApplications / totalApplications) * 100).toFixed(2)
          : 0;

      // Get top certifications by applications
      const topCertifications = await Application.aggregate([
        {
          $group: {
            _id: "$certificationId",
            count: { $sum: 1 },
          },
        },
        {
          $sort: { count: -1 },
        },
        {
          $limit: 10,
        },
        {
          $lookup: {
            from: "certifications",
            localField: "_id",
            foreignField: "_id",
            as: "certification",
          },
        },
        {
          $unwind: "$certification",
        },
      ]);

      // Get last 5 applications with dates
      const lastFiveApplications = await Application.find()
        .sort({ createdAt: -1 })
        .limit(5)
        .select("_id status createdAt userId certificationId")
        .populate("userId", "firstName lastName email")
        .populate("certificationId", "name")
        .lean();

      const reportingData = {
        timestamp: new Date(),
        applicationMetrics: {
          newApplicationsLast30Days: newApplications,
          totalApplicationsAllTime: totalApplications,
          statusBreakdown: applicationStatuses,
          completedApplications,
          completionRatePercentage: parseFloat(completionRate),
        },
        paymentMetrics: {
          unpaidPaymentsCount: unpaidPayments,
          totalPaymentsAllTime: totalPayments,
          paymentStatusBreakdown: paymentStats,
          last30DaysPayments: recentPaymentStats,
          paymentTypeBreakdown,
        },
        studentMetrics: {
          totalStudents,
          averageApplicationsPerStudent: parseFloat(avgApplicationsPerStudent),
          studentsByApplicationStatus: studentsByStatus,
        },
        certificateMetrics: {
          certificatesGenerated,
        },
        userMetrics: {
          adminUsers,
          assessorUsers,
          totalStudents,
        },
        topCertifications: topCertifications.map((cert) => ({
          certificationId: cert._id,
          certificationName: cert.certification?.name || "Unknown",
          applicationCount: cert.count,
        })),
        lastFiveApplications: lastFiveApplications.map((app) => ({
          applicationId: app._id,
          studentName: app.userId
            ? `${app.userId.firstName} ${app.userId.lastName}`
            : "Unknown",
          studentEmail: app.userId?.email || "Unknown",
          certificationName: app.certificationId?.name || "Unknown",
          status: app.status,
          createdDate: app.createdAt,
        })),
      };

      res.status(200).json({
        success: true,
        data: reportingData,
      });
    } catch (error) {
      console.error("Error fetching reporting data:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching reporting data",
        error: error.message,
      });
    }
  },
};

module.exports = reportingController;
