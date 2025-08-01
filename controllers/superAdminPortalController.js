// controllers/superAdminPortalController.js
const User = require("../models/user");
const FormTemplate = require("../models/formTemplate");
const Certification = require("../models/certification");
const Application = require("../models/application");
const Payment = require("../models/payment");
const Certificate = require("../models/certificate");

// Super Admin Portal Dashboard Stats
const getPortalDashboardStats = async (req, res) => {
  try {
    // Get user statistics
    const totalUsers = await User.countDocuments();
    const activeUsers = await User.countDocuments({ isActive: true });
    const superAdmins = await User.countDocuments({ userType: "super_admin" });
    const admins = await User.countDocuments({ userType: "admin" });
    const assessors = await User.countDocuments({ userType: "assessor" });
    const regularUsers = await User.countDocuments({ userType: "user" });

    // Get form template statistics
    const totalFormTemplates = await FormTemplate.countDocuments();
    const activeFormTemplates = await FormTemplate.countDocuments({ isActive: true });

    // Get certification statistics
    const totalCertifications = await Certification.countDocuments();
    const activeCertifications = await Certification.countDocuments({ isActive: true });

    // Get application statistics
    const totalApplications = await Application.countDocuments();
    const pendingApplications = await Application.countDocuments({ overallStatus: "payment_pending" });
    const processingApplications = await Application.countDocuments({ overallStatus: "processing" });
    const completedApplications = await Application.countDocuments({ overallStatus: "completed" });

    // Get payment statistics
    const totalPayments = await Payment.countDocuments();
    const successfulPayments = await Payment.countDocuments({ status: "succeeded" });
    const pendingPayments = await Payment.countDocuments({ status: "pending" });

    // Get certificate statistics
    const totalCertificates = await Certificate.countDocuments();
    const issuedCertificates = await Certificate.countDocuments({ status: "issued" });

    res.json({
      success: true,
      data: {
        users: {
          total: totalUsers,
          active: activeUsers,
          superAdmins,
          admins,
          assessors,
          regularUsers,
        },
        formTemplates: {
          total: totalFormTemplates,
          active: activeFormTemplates,
        },
        certifications: {
          total: totalCertifications,
          active: activeCertifications,
        },
        applications: {
          total: totalApplications,
          pending: pendingApplications,
          processing: processingApplications,
          completed: completedApplications,
        },
        payments: {
          total: totalPayments,
          successful: successfulPayments,
          pending: pendingPayments,
        },
        certificates: {
          total: totalCertificates,
          issued: issuedCertificates,
        },
      },
    });
  } catch (error) {
    console.error("Get portal dashboard stats error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching dashboard statistics",
    });
  }
};

// Get form templates for super admin portal
const getFormTemplatesForPortal = async (req, res) => {
  try {
    const { page = 1, limit = 20, search, filledBy, isActive } = req.query;
    const skip = (page - 1) * limit;

    let query = {};

    // Filter by filledBy if provided
    if (filledBy) {
      query.filledBy = filledBy;
    }

    // Filter by active status if provided
    if (isActive !== undefined) {
      query.isActive = isActive === "true";
    }

    // Search functionality
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];
    }

    const formTemplates = await FormTemplate.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const totalFormTemplates = await FormTemplate.countDocuments(query);

    // Get filledBy counts for filters
    const filledByCounts = await FormTemplate.aggregate([
      {
        $group: {
          _id: "$filledBy",
          count: { $sum: 1 },
        },
      },
    ]);

    res.json({
      success: true,
      data: {
        formTemplates,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalFormTemplates / limit),
          totalFormTemplates,
          hasNextPage: page * limit < totalFormTemplates,
          hasPrevPage: page > 1,
        },
        filters: {
          filledByCounts,
        },
      },
    });
  } catch (error) {
    console.error("Get form templates for portal error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching form templates",
    });
  }
};

// Get certifications for super admin portal
const getCertificationsForPortal = async (req, res) => {
  try {
    const { page = 1, limit = 20, search, isActive } = req.query;
    const skip = (page - 1) * limit;

    let query = {};

    // Filter by active status if provided
    if (isActive !== undefined) {
      query.isActive = isActive === "true";
    }

    // Search functionality
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];
    }

    const certifications = await Certification.find(query)
      .populate("formTemplateIds.formTemplateId", "name description")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const totalCertifications = await Certification.countDocuments(query);

    res.json({
      success: true,
      data: {
        certifications,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalCertifications / limit),
          totalCertifications,
          hasNextPage: page * limit < totalCertifications,
          hasPrevPage: page > 1,
        },
      },
    });
  } catch (error) {
    console.error("Get certifications for portal error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching certifications",
    });
  }
};

// Get form template by ID for portal
const getFormTemplateByIdForPortal = async (req, res) => {
  try {
    const { id } = req.params;

    const formTemplate = await FormTemplate.findById(id);
    if (!formTemplate) {
      return res.status(404).json({
        success: false,
        message: "Form template not found",
      });
    }

    res.json({
      success: true,
      data: formTemplate,
    });
  } catch (error) {
    console.error("Get form template by ID for portal error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching form template",
    });
  }
};

// Get certification by ID for portal
const getCertificationByIdForPortal = async (req, res) => {
  try {
    const { id } = req.params;

    const certification = await Certification.findById(id)
      .populate("formTemplateIds.formTemplateId", "name description stepNumber filledBy");

    if (!certification) {
      return res.status(404).json({
        success: false,
        message: "Certification not found",
      });
    }

    res.json({
      success: true,
      data: certification,
    });
  } catch (error) {
    console.error("Get certification by ID for portal error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching certification",
    });
  }
};

// Get all form templates for dropdown (simplified)
const getAllFormTemplatesForDropdown = async (req, res) => {
  try {
    const formTemplates = await FormTemplate.find({ isActive: true })
      .select("name description stepNumber filledBy")
      .sort({ name: 1 });

    res.json({
      success: true,
      data: formTemplates,
    });
  } catch (error) {
    console.error("Get form templates for dropdown error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching form templates",
    });
  }
};

module.exports = {
  getPortalDashboardStats,
  getFormTemplatesForPortal,
  getCertificationsForPortal,
  getFormTemplateByIdForPortal,
  getCertificationByIdForPortal,
  getAllFormTemplatesForDropdown,
}; 