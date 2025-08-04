// controllers/adminController.js
const User = require("../models/user");
const { rtoFilter } = require("../middleware/tenant");

// Create Sales Manager
const createSalesManager = async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      email,
      password,
      phoneNumber,
      permissions = [],
    } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "User with this email already exists",
      });
    }

    // Default permissions for sales manager
    const defaultPermissions = [
      { module: "applications", actions: ["read", "update"] },
      { module: "users", actions: ["read"] },
      { module: "reports", actions: ["read"] },
      { module: "certifications", actions: ["read"] },
    ];

    const salesManager = await User.create({
      firstName,
      lastName,
      email,
      password,
      phoneNumber,
      userType: "sales_manager",
      permissions: permissions.length > 0 ? permissions : defaultPermissions,
    });

    res.status(201).json({
      success: true,
      message: "Sales Manager created successfully",
      data: {
        user: {
          id: salesManager._id,
          firstName: salesManager.firstName,
          lastName: salesManager.lastName,
          email: salesManager.email,
          userType: salesManager.userType,
          permissions: salesManager.permissions,
        },
      },
    });
  } catch (error) {
    console.error("Create sales manager error:", error);
    res.status(500).json({
      success: false,
      message: "Server error creating sales manager",
    });
  }
};

// Create Sales Agent
const createSalesAgent = async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      email,
      password,
      phoneNumber,
      permissions = [],
    } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "User with this email already exists",
      });
    }

    // Default permissions for sales agent
    const defaultPermissions = [
      { module: "applications", actions: ["read"] },
      { module: "users", actions: ["read"] },
      { module: "certifications", actions: ["read"] },
    ];

    const salesAgent = await User.create({
      firstName,
      lastName,
      email,
      password,
      phoneNumber,
      userType: "sales_agent",
      permissions: permissions.length > 0 ? permissions : defaultPermissions,
    });

    res.status(201).json({
      success: true,
      message: "Sales Agent created successfully",
      data: {
        user: {
          id: salesAgent._id,
          firstName: salesAgent.firstName,
          lastName: salesAgent.lastName,
          email: salesAgent.email,
          userType: salesAgent.userType,
          permissions: salesAgent.permissions,
        },
      },
    });
  } catch (error) {
    console.error("Create sales agent error:", error);
    res.status(500).json({
      success: false,
      message: "Server error creating sales agent",
    });
  }
};

// Create Assessor
const createAssessor = async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      email,
      password,
      phoneNumber,
      permissions = [],
    } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "User with this email already exists",
      });
    }

    // Default permissions for assessor
    const defaultPermissions = [
      { module: "applications", actions: ["read", "update"] },
      { module: "assessments", actions: ["read", "write", "update"] },
      { module: "certifications", actions: ["read", "write", "update"] },
      { module: "users", actions: ["read"] },
      { module: "reports", actions: ["read"] },
    ];

    const assessor = await User.create({
      firstName,
      lastName,
      email,
      password,
      phoneNumber,
      userType: "assessor",
      permissions: permissions.length > 0 ? permissions : defaultPermissions,
    });

    res.status(201).json({
      success: true,
      message: "Assessor created successfully",
      data: {
        user: {
          id: assessor._id,
          firstName: assessor.firstName,
          lastName: assessor.lastName,
          email: assessor.email,
          userType: assessor.userType,
          permissions: assessor.permissions,
        },
      },
    });
  } catch (error) {
    console.error("Create assessor error:", error);
    res.status(500).json({
      success: false,
      message: "Server error creating assessor",
    });
  }
};

// Update user permissions
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

    if (user.userType === "admin") {
      return res.status(400).json({
        success: false,
        message: "Cannot modify admin permissions",
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
    console.error("Update permissions error:", error);
    res.status(500).json({
      success: false,
      message: "Server error updating permissions",
    });
  }
};

// Get all users
const getAllUsers = async (req, res) => {
  try {
    const { userType, page = 1, limit = 10 } = req.query;

    const filter = {};
    if (userType) {
      filter.userType = userType;
    }

    const users = await User.find({ ...rtoFilter(req.rtoId), ...filter })
      .select("-password")
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ createdAt: -1 });

    const total = await User.countDocuments({ ...rtoFilter(req.rtoId), ...filter });

    res.json({
      success: true,
      data: {
        users,
        pagination: {
          current: page,
          pages: Math.ceil(total / limit),
          total,
        },
      },
    });
  } catch (error) {
    console.error("Get users error:", error);
    res.status(500).json({
      success: false,
      message: "Server error fetching users",
    });
  }
};

module.exports = {
  createSalesManager,
  createSalesAgent,
  createAssessor,
  updateUserPermissions,
  getAllUsers,
};
