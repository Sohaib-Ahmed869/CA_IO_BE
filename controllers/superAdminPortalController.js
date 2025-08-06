// controllers/superAdminPortalController.js
const User = require("../models/user");
const logme = require("../utils/logger");
const FormTemplate = require("../models/formTemplate");
const Certification = require("../models/certification");
const Application = require("../models/application");
const Payment = require("../models/payment");
const Certificate = require("../models/certificate");
const { rtoFilter } = require("../middleware/tenant");

// Super Admin Portal Dashboard Stats
const getPortalDashboardStats = async (req, res) => {
  try {
    // Get user statistics
    const totalUsers = await User.countDocuments({ ...rtoFilter(req.rtoId) });
    const activeUsers = await User.countDocuments({ ...rtoFilter(req.rtoId), isActive: true });
    const superAdmins = await User.countDocuments({ ...rtoFilter(req.rtoId), userType: "super_admin" });
    const admins = await User.countDocuments({ ...rtoFilter(req.rtoId), userType: "admin" });
    const assessors = await User.countDocuments({ ...rtoFilter(req.rtoId), userType: "assessor" });
    const regularUsers = await User.countDocuments({ ...rtoFilter(req.rtoId), userType: "user" });

    // Get form template statistics
    const totalFormTemplates = await FormTemplate.countDocuments({ ...rtoFilter(req.rtoId) });
    const activeFormTemplates = await FormTemplate.countDocuments({ ...rtoFilter(req.rtoId), isActive: true });

    // Get certification statistics
    const totalCertifications = await Certification.countDocuments({ ...rtoFilter(req.rtoId) });
    const activeCertifications = await Certification.countDocuments({ ...rtoFilter(req.rtoId), isActive: true });

    // Get application statistics
    const totalApplications = await Application.countDocuments({ ...rtoFilter(req.rtoId) });
    const pendingApplications = await Application.countDocuments({ ...rtoFilter(req.rtoId), overallStatus: "payment_pending" });
    const processingApplications = await Application.countDocuments({ ...rtoFilter(req.rtoId), overallStatus: "processing" });
    const completedApplications = await Application.countDocuments({ ...rtoFilter(req.rtoId), overallStatus: "completed" });

    // Get payment statistics
    const totalPayments = await Payment.countDocuments();
    const successfulPayments = await Payment.countDocuments({ status: "succeeded" });
    const pendingPayments = await Payment.countDocuments({ status: "pending" });

    // Get certificate statistics
    const totalCertificates = await Certificate.countDocuments({ ...rtoFilter(req.rtoId) });
    const issuedCertificates = await Certificate.countDocuments({ ...rtoFilter(req.rtoId), status: "issued" });

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
    logme.error("Get portal dashboard stats error:", error);
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
    logme.error("Get form templates for portal error:", error);
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
    logme.error("Get certifications for portal error:", error);
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
    logme.error("Get form template by ID for portal error:", error);
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
    logme.error("Get certification by ID for portal error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching certification",
    });
  }
};

// Debug endpoint to check all form templates
const debugAllFormTemplates = async (req, res) => {
  try {
    const allFormTemplates = await FormTemplate.find({})
      .select("name description stepNumber filledBy rtoId isActive")
      .populate("rtoId", "companyName")
      .sort({ name: 1 });

    logme.info("Debug: All form templates", {
      totalCount: allFormTemplates.length,
      activeCount: allFormTemplates.filter(t => t.isActive).length,
      withRtoCount: allFormTemplates.filter(t => t.rtoId).length,
      withoutRtoCount: allFormTemplates.filter(t => !t.rtoId).length,
      sampleTemplates: allFormTemplates.slice(0, 5).map(t => ({
        name: t.name,
        isActive: t.isActive,
        rtoId: t.rtoId,
        rtoName: t.rtoId?.companyName
      }))
    });

    res.json({
      success: true,
      data: {
        totalCount: allFormTemplates.length,
        activeCount: allFormTemplates.filter(t => t.isActive).length,
        templates: allFormTemplates
      },
    });
  } catch (error) {
    logme.error("Debug form templates error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while debugging form templates",
    });
  }
};

// Get all form templates for dropdown (simplified)
const getAllFormTemplatesForDropdown = async (req, res) => {
  try {
    // Build query with RTO filtering
    let query = { isActive: true };
    
    // Add RTO filtering if available
    if (req.rtoId) {
      query.rtoId = req.rtoId;
    } else {
      // If no RTO context, show all form templates (for super admin)
      // This allows super admin to see all form templates across all RTOs
    }

    const formTemplates = await FormTemplate.find(query)
      .select("name description stepNumber filledBy rtoId")
      .populate("rtoId", "companyName")
      .sort({ name: 1 });

    logme.info("Form templates for dropdown fetched", {
      count: formTemplates.length,
      rtoId: req.rtoId,
      query: query,
      sampleTemplates: formTemplates.slice(0, 3).map(t => ({ 
        name: t.name, 
        rtoId: t.rtoId,
        rtoName: t.rtoId?.companyName 
      }))
    });

    res.json({
      success: true,
      data: formTemplates,
    });
  } catch (error) {
    logme.error("Get form templates for dropdown error:", error);
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
  debugAllFormTemplates,
}; 