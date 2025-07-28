// controllers/superAdminController.js
const User = require("../models/user");
const Certification = require("../models/certification");
const Application = require("../models/application");
const Payment = require("../models/payment");
const Certificate = require("../models/certificate");

// Get system statistics (Super Admin only)
const getSystemStats = async (req, res) => {
  try {
    // Get user statistics
    const totalUsers = await User.countDocuments();
    const activeUsers = await User.countDocuments({ isActive: true });
    const superAdmins = await User.countDocuments({ userType: "super_admin" });
    const admins = await User.countDocuments({ userType: "admin" });
    const assessors = await User.countDocuments({ userType: "assessor" });
    const regularUsers = await User.countDocuments({ userType: "user" });

    // Get application statistics
    const totalApplications = await Application.countDocuments();
    const pendingApplications = await Application.countDocuments({ overallStatus: "payment_pending" });
    const processingApplications = await Application.countDocuments({ overallStatus: "processing" });
    const completedApplications = await Application.countDocuments({ overallStatus: "completed" });

    // Get payment statistics
    const totalPayments = await Payment.countDocuments();
    const successfulPayments = await Payment.countDocuments({ status: "succeeded" });
    const pendingPayments = await Payment.countDocuments({ status: "pending" });

    // Get certification statistics
    const totalCertifications = await Certification.countDocuments();
    const activeCertifications = await Certification.countDocuments({ isActive: true });

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
        certifications: {
          total: totalCertifications,
          active: activeCertifications,
        },
        certificates: {
          total: totalCertificates,
          issued: issuedCertificates,
        },
      },
    });
  } catch (error) {
    console.error("Get system stats error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching system statistics",
    });
  }
};

// Get user management data (Super Admin only)
const getUserManagementData = async (req, res) => {
  try {
    const { page = 1, limit = 20, userType, search, isActive } = req.query;
    const skip = (page - 1) * limit;

    let query = {};

    // Filter by user type if provided
    if (userType) {
      query.userType = userType;
    }

    // Filter by active status if provided
    if (isActive !== undefined) {
      query.isActive = isActive === "true";
    }

    // Search functionality
    if (search) {
      query.$or = [
        { firstName: { $regex: search, $options: "i" } },
        { lastName: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
    }

    const users = await User.find(query)
      .select("-password")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const totalUsers = await User.countDocuments(query);

    // Get user type counts for filters
    const userTypeCounts = await User.aggregate([
      {
        $group: {
          _id: "$userType",
          count: { $sum: 1 },
        },
      },
    ]);

    res.json({
      success: true,
      data: {
        users,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalUsers / limit),
          totalUsers,
          hasNextPage: page * limit < totalUsers,
          hasPrevPage: page > 1,
        },
        filters: {
          userTypeCounts,
        },
      },
    });
  } catch (error) {
    console.error("Get user management data error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching user management data",
    });
  }
};

// Update user permissions (Super Admin only)
const updateUserPermissions = async (req, res) => {
  try {
    const { userId } = req.params;
    const { permissions } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Prevent modifying super admin permissions
    if (user.userType === "super_admin") {
      return res.status(400).json({
        success: false,
        message: "Cannot modify super admin permissions",
      });
    }

    user.permissions = permissions;
    await user.save();

    res.json({
      success: true,
      message: "User permissions updated successfully",
      data: {
        user: {
          id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          userType: user.userType,
          permissions: user.permissions,
        },
      },
    });
  } catch (error) {
    console.error("Update user permissions error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while updating user permissions",
    });
  }
};

// Delete user (Super Admin only)
const deleteUser = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Prevent deleting super admin
    if (user.userType === "super_admin") {
      return res.status(400).json({
        success: false,
        message: "Cannot delete super admin user",
      });
    }

    // Prevent deleting self
    if (req.user._id.toString() === userId) {
      return res.status(400).json({
        success: false,
        message: "Cannot delete your own account",
      });
    }

    await User.findByIdAndDelete(userId);

    res.json({
      success: true,
      message: "User deleted successfully",
    });
  } catch (error) {
    console.error("Delete user error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while deleting user",
    });
  }
};

module.exports = {
  getSystemStats,
  getUserManagementData,
  updateUserPermissions,
  deleteUser,
}; 