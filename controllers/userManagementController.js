const User = require("../models/user");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const emailService = require("../services/emailService2");

// Central ACL catalog
const ACL_CATALOG = Object.freeze({
  finance_dashboard: ["read"],
  applications: ["read", "update", "export"],
  applications_archived: ["read", "export"],
  tasks: ["read", "write", "update", "delete"],
  users: ["read", "update"],
  students: ["read"],
});

// Role templates
const ROLE_TEMPLATES = Object.freeze({
  manager: [
    { module: "finance_dashboard", action: "read" },
    { module: "applications", action: "read" },
    { module: "applications_archived", action: "read" },
    { module: "tasks", action: "read" },
    { module: "tasks", action: "update" },
    { module: "users", action: "read" },
    { module: "students", action: "read" },
  ],
  sales_manager: [
    { module: "finance_dashboard", action: "read" },
    { module: "applications", action: "read" },
    { module: "applications_archived", action: "read" },
    { module: "tasks", action: "read" },
    { module: "tasks", action: "update" },
    { module: "users", action: "read" },
    { module: "students", action: "read" },
  ],
  sales_agent: [
    { module: "applications", action: "read" },
    { module: "applications_archived", action: "read" },
    { module: "tasks", action: "read" },
    { module: "students", action: "read" },
  ],
});

// Helper function to get allowed user types based on current user role
const getAllowedUserTypes = (isCEO) => {
  if (isCEO) {
    return ["super_admin", "admin", "sales_agent", "sales_manager", "assessor", "user"];
  } else {
    return ["user"]; // Non-CEO admins can only create regular users
  }
};

// Create a new user (admin/CEO only)
const createUser = async (req, res) => {
  try {
    const { firstName, lastName, email, password, userType, phoneCode, phoneNumber } = req.body;

    // Validate required fields
    if (!firstName || !lastName || !email || !password || !userType) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: firstName, lastName, email, password, userType"
      });
    }

    // Get allowed user types based on current user's role
    const allowedUserTypes = getAllowedUserTypes(req.user.ceo);
    
    // Validate userType
    if (!allowedUserTypes.includes(userType)) {
      const message = req.user.ceo 
        ? `Invalid userType. Must be one of: ${allowedUserTypes.join(", ")}`
        : `Only CEO can create privileged roles. You can only create: ${allowedUserTypes.join(", ")}`;
      
      return res.status(403).json({
        success: false,
        message
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "User with this email already exists"
      });
    }

    // Validate password strength
    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters long"
      });
    }

    // Create new user
    const newUser = new User({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.toLowerCase().trim(),
      password,
      userType,
      phoneCode: phoneCode || '+61',
      phoneNumber: phoneNumber || '',
      isActive: true,
      // Set CEO flag if userType is super_admin
      ceo: userType === 'super_admin'
    });

    await newUser.save();

    // Return user without password
    const userResponse = {
      _id: newUser._id,
      firstName: newUser.firstName,
      lastName: newUser.lastName,
      email: newUser.email,
      userType: newUser.userType,
      phoneCode: newUser.phoneCode,
      phoneNumber: newUser.phoneNumber,
      isActive: newUser.isActive,
      ceo: newUser.ceo,
      createdAt: newUser.createdAt,
      updatedAt: newUser.updatedAt
    };

    res.status(201).json({
      success: true,
      message: "User created successfully",
      data: userResponse
    });

  } catch (error) {
    console.error("Create user error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message
    });
  }
};

// Get all users with filtering and pagination (admin/CEO only)
const getUsers = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      userType,
      roles,
      search,
      isActive,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      includeCounts
    } = req.query;

    // Build filter object
    const filter = {};

    if (userType) {
      filter.userType = userType;
    } else {
      // Support roles filter (comma-separated). Default to ACL roles when no explicit filter given.
      const rolesList = (roles || '').toString().split(',').map(r => r.trim()).filter(Boolean);
      if (rolesList.length > 0) {
        filter.userType = { $in: rolesList };
      } else {
        filter.userType = { $in: ['sales_agent', 'sales_manager'] };
      }
    }

    if (isActive !== undefined) {
      filter.isActive = isActive === 'true';
    }

    if (search) {
      filter.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get users with pagination
    const users = await User.find(filter)
      .select('-password -resetPasswordToken -resetPasswordExpires')
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count for pagination
    const totalUsers = await User.countDocuments(filter);
    const totalPages = Math.ceil(totalUsers / parseInt(limit));

    // Get user type distribution
    const userTypeStats = await User.aggregate([
      { $group: { _id: '$userType', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    // Optional: counts for current filter (for pagination widgets, tabs, etc.)
    let counts = undefined;
    if ((includeCounts || '').toString().toLowerCase() === 'true') {
      const [roleCountsAgg, activeCountsAgg] = await Promise.all([
        User.aggregate([
          { $match: filter },
          { $group: { _id: '$userType', count: { $sum: 1 } } }
        ]),
        User.aggregate([
          { $match: filter },
          { $group: { _id: '$isActive', count: { $sum: 1 } } }
        ])
      ]);

      const byRole = {
        super_admin: 0,
        admin: 0,
        assessor: 0,
        sales_manager: 0,
        sales_agent: 0,
        user: 0
      };
      roleCountsAgg.forEach(rc => {
        if (byRole.hasOwnProperty(rc._id)) byRole[rc._id] = rc.count;
      });

      let activeCount = 0;
      let inactiveCount = 0;
      activeCountsAgg.forEach(ac => {
        if (ac._id === true) activeCount = ac.count; else inactiveCount = ac.count;
      });

      counts = {
        total: totalUsers,
        byRole,
        active: activeCount,
        inactive: inactiveCount
      };
    }

    res.json({
      success: true,
      data: {
        users,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalUsers,
          hasNextPage: parseInt(page) < totalPages,
          hasPrevPage: parseInt(page) > 1
        },
        stats: {
          userTypeDistribution: userTypeStats
        },
        counts
      }
    });

  } catch (error) {
    console.error("Get users error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message
    });
  }
};

// Get user by ID (admin/CEO only)
const getUserById = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId)
      .select('-password -resetPasswordToken -resetPasswordExpires');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    res.json({
      success: true,
      data: user
    });

  } catch (error) {
    console.error("Get user by ID error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message
    });
  }
};

// Update user (admin/CEO only)
const updateUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const { firstName, lastName, email, userType, phoneCode, phoneNumber, isActive } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    // Check if non-CEO admin is trying to update to privileged roles
    if (userType) {
      const allowedUserTypes = getAllowedUserTypes(req.user.ceo);
      if (!allowedUserTypes.includes(userType)) {
        const message = req.user.ceo 
          ? `Invalid userType. Must be one of: ${allowedUserTypes.join(", ")}`
          : `Only CEO can assign privileged roles. You can only assign: ${allowedUserTypes.join(", ")}`;
        
        return res.status(403).json({
          success: false,
          message
        });
      }
    }

    // Check if email is being changed and if it already exists
    if (email && email !== user.email) {
      const existingUser = await User.findOne({ 
        email: email.toLowerCase(),
        _id: { $ne: userId }
      });
      if (existingUser) {
        return res.status(409).json({
          success: false,
          message: "Email already exists for another user"
        });
      }
    }

    // Update fields
    if (firstName) user.firstName = firstName.trim();
    if (lastName) user.lastName = lastName.trim();
    if (email) user.email = email.toLowerCase().trim();
    if (userType) {
      user.userType = userType;
      user.ceo = userType === 'super_admin';
    }
    if (phoneCode !== undefined) user.phoneCode = phoneCode;
    if (phoneNumber !== undefined) user.phoneNumber = phoneNumber;
    if (isActive !== undefined) user.isActive = isActive;

    await user.save();

    // Return updated user without password
    const userResponse = {
      _id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      userType: user.userType,
      phoneCode: user.phoneCode,
      phoneNumber: user.phoneNumber,
      isActive: user.isActive,
      ceo: user.ceo,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    };

    res.json({
      success: true,
      message: "User updated successfully",
      data: userResponse
    });

  } catch (error) {
    console.error("Update user error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message
    });
  }
};

// Deactivate user (admin/CEO only)
const deactivateUser = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    user.isActive = false;
    await user.save();

    res.json({
      success: true,
      message: "User deactivated successfully"
    });

  } catch (error) {
    console.error("Deactivate user error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message
    });
  }
};

// Reset user password (admin/CEO only)
const resetUserPassword = async (req, res) => {
  try {
    const { userId } = req.params;
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: "New password must be at least 6 characters long"
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    user.password = newPassword;
    await user.save();

    res.json({
      success: true,
      message: "User password reset successfully"
    });

  } catch (error) {
    console.error("Reset user password error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message
    });
  }
};

// Get allowed user types for current user (admin/CEO only)
const getAllowedUserTypesEndpoint = async (req, res) => {
  try {
    const allowedUserTypes = getAllowedUserTypes(req.user.ceo);
    
    res.json({
      success: true,
      data: {
        allowedUserTypes,
        isCEO: req.user.ceo,
        currentUserType: req.user.userType
      }
    });

  } catch (error) {
    console.error("Get allowed user types error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message
    });
  }
};

// Get user statistics for dashboard (admin/CEO only)
const getUserStats = async (req, res) => {
  try {
    // Get total users count
    const totalUsers = await User.countDocuments();

    // Get active users count
    const activeUsers = await User.countDocuments({ isActive: true });

    // Get admins count (admin + super_admin)
    const admins = await User.countDocuments({ 
      userType: { $in: ['admin', 'super_admin'] } 
    });

    // Get assessors count
    const assessors = await User.countDocuments({ userType: 'assessor' });

    // Get sales agents count
    const salesAgents = await User.countDocuments({ userType: 'sales_agent' });

    // Get sales managers count
    const salesManagers = await User.countDocuments({ userType: 'sales_manager' });

    // Get regular users count
    const regularUsers = await User.countDocuments({ userType: 'user' });

    // Get inactive users count
    const inactiveUsers = await User.countDocuments({ isActive: false });

    // Get recent users (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recentUsers = await User.countDocuments({ 
      createdAt: { $gte: thirtyDaysAgo } 
    });

    // Get user type distribution
    const userTypeDistribution = await User.aggregate([
      {
        $group: {
          _id: '$userType',
          count: { $sum: 1 }
        }
      },
      {
        $sort: { count: -1 }
      }
    ]);

    // Get monthly user creation trend (last 6 months)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    
    const monthlyTrend = await User.aggregate([
      {
        $match: {
          createdAt: { $gte: sixMonthsAgo }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' }
          },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { '_id.year': 1, '_id.month': 1 }
      }
    ]);

    res.json({
      success: true,
      data: {
        totalUsers,
        activeUsers,
        inactiveUsers,
        admins,
        assessors,
        salesAgents,
        salesManagers,
        regularUsers,
        recentUsers,
        userTypeDistribution,
        monthlyTrend
      }
    });

  } catch (error) {
    console.error("Get user stats error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message
    });
  }
};

module.exports = {
  createUser,
  getUsers,
  getUserById,
  updateUser,
  deactivateUser,
  resetUserPassword,
  getUserStats,
  getAllowedUserTypesEndpoint
};

// Admin/CEO creates a student user with random 16-byte password and sends email
const createStudentByAdmin = async (req, res) => {
  try {
    const { firstName, lastName, email, phoneCode, phoneNumber } = req.body;

    if (!firstName || !lastName || !email) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: firstName, lastName, email"
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email: email.toLowerCase().trim() });
    if (existingUser) {
      return res.status(409).json({ success: false, message: "User with this email already exists" });
    }

    // Generate 16-byte random password (base64url ~ 22 chars, URL-safe)
    const tempPassword = crypto.randomBytes(16).toString("base64url");

    // Create user as regular student
    const newUser = new User({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.toLowerCase().trim(),
      password: tempPassword,
      userType: "user",
      phoneCode: phoneCode || "+61",
      phoneNumber: phoneNumber || "",
      isActive: true,
      ceo: false
    });
    await newUser.save();

    // Send credentials email using RTO-specific email service
    if (req.rtoConfig) {
      const { sendRTOAdminCreatedAccountEmail } = require('../utils/rtoEmailUtils');
      await sendRTOAdminCreatedAccountEmail(req.rtoConfig, newUser, tempPassword);
    } else {
      await emailService.sendAdminCreatedAccountEmail(newUser, tempPassword);
    }

    // Prepare response without password hash
    const userResponse = {
      _id: newUser._id,
      firstName: newUser.firstName,
      lastName: newUser.lastName,
      email: newUser.email,
      userType: newUser.userType,
      phoneCode: newUser.phoneCode,
      phoneNumber: newUser.phoneNumber,
      isActive: newUser.isActive,
      ceo: newUser.ceo,
      createdAt: newUser.createdAt,
      updatedAt: newUser.updatedAt
    };

    return res.status(201).json({
      success: true,
      message: "Student user created and credentials emailed",
      data: userResponse,
      meta: { temporaryPassword: tempPassword, redirectUrl: process.env.FRONTEND_URL || "http://localhost:5173" }
    });
  } catch (error) {
    console.error("Admin create student error:", error);
    return res.status(500).json({ success: false, message: "Internal server error", error: error.message });
  }
};

module.exports.createStudentByAdmin = createStudentByAdmin;

// ===== Permissions & Roles (Admin only) =====

// List ACL modules/actions available on backend
module.exports.getAclModules = async (req, res) => {
  try {
    res.json({ success: true, data: ACL_CATALOG });
  } catch (error) {
    res.status(500).json({ success: false, message: "Internal server error", error: error.message });
  }
};

// Get a user's effective permissions
module.exports.getUserPermissions = async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findById(userId).select("permissions userType");
    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    res.json({ success: true, data: user.permissions || [], meta: { permissionsEnabled: ['sales_agent','sales_manager'].includes(user.userType) } });
  } catch (error) {
    res.status(500).json({ success: false, message: "Internal server error", error: error.message });
  }
};

// List ACL subjects by role filter
module.exports.getPermissionSubjects = async (req, res) => {
  try {
    const rolesParam = (req.query.roles || '').toString();
    const roles = rolesParam ? rolesParam.split(',').map(r => r.trim()).filter(Boolean) : ['sales_agent','sales_manager'];
    const users = await User.find({ userType: { $in: roles } })
      .select('_id firstName lastName email userType permissions isActive')
      .sort({ createdAt: -1 });
    res.json({ success: true, data: users });
  } catch (error) {
    res.status(500).json({ success: false, message: "Internal server error", error: error.message });
  }
};

// Grant a permission { userId, module, action }
module.exports.grantPermission = async (req, res) => {
  try {
    const { userId, module, action } = req.body || {};
    if (!userId || !module || !action) {
      return res.status(400).json({ success: false, message: "userId, module, action are required" });
    }
    if (!ACL_CATALOG[module] || !ACL_CATALOG[module].includes(action)) {
      return res.status(400).json({ success: false, message: "Invalid module/action" });
    }
    const user = await User.findById(userId).select("permissions userType");
    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    if (!['sales_agent','sales_manager'].includes(user.userType)) {
      return res.status(403).json({ success: false, message: "ACL not applicable to this role" });
    }
    const perms = Array.isArray(user.permissions) ? user.permissions : [];
    const exists = perms.some(p => p.module === module && p.actions && p.actions.includes(action));
    if (!exists) {
      const existing = perms.find(p => p.module === module);
      if (existing) existing.actions.push(action); else perms.push({ module, actions: [action] });
      user.permissions = perms;
      await user.save();
    }
    res.json({ success: true, message: "Permission granted", data: user.permissions });
  } catch (error) {
    res.status(500).json({ success: false, message: "Internal server error", error: error.message });
  }
};

// Revoke a permission { userId, module, action }
module.exports.revokePermission = async (req, res) => {
  try {
    const { userId, module, action } = req.body || {};
    if (!userId || !module || !action) {
      return res.status(400).json({ success: false, message: "userId, module, action are required" });
    }
    const user = await User.findById(userId).select("permissions userType");
    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    if (!['sales_agent','sales_manager'].includes(user.userType)) {
      return res.status(403).json({ success: false, message: "ACL not applicable to this role" });
    }
    const perms = Array.isArray(user.permissions) ? user.permissions : [];
    const existing = perms.find(p => p.module === module);
    if (existing && Array.isArray(existing.actions)) {
      existing.actions = existing.actions.filter(a => a !== action);
      if (existing.actions.length === 0) {
        user.permissions = perms.filter(p => p !== existing);
      }
      await user.save();
    }
    res.json({ success: true, message: "Permission revoked", data: user.permissions || [] });
  } catch (error) {
    res.status(500).json({ success: false, message: "Internal server error", error: error.message });
  }
};

// Assign a role template (e.g., manager) { userId, role }
module.exports.assignRole = async (req, res) => {
  try {
    const { userId, role } = req.body || {};
    if (!userId || !role) return res.status(400).json({ success: false, message: "userId and role are required" });
    const template = ROLE_TEMPLATES[role];
    if (!template) return res.status(400).json({ success: false, message: "Unknown role" });

    const user = await User.findById(userId).select("permissions userType");
    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    // Validate the template matches the user's userType scope
    if (role === 'sales_manager' && user.userType !== 'sales_manager') {
      return res.status(400).json({ success: false, message: "Role template does not match userType" });
    }
    if (role === 'sales_agent' && user.userType !== 'sales_agent') {
      return res.status(400).json({ success: false, message: "Role template does not match userType" });
    }
    if (role === 'manager' && !['sales_manager'].includes(user.userType)) {
      return res.status(400).json({ success: false, message: "Manager template intended for sales_manager" });
    }
    const perms = Array.isArray(user.permissions) ? user.permissions : [];

    // Merge template
    for (const { module, action } of template) {
      let mod = perms.find(p => p.module === module);
      if (!mod) {
        perms.push({ module, actions: [action] });
      } else if (!mod.actions.includes(action)) {
        mod.actions.push(action);
      }
    }
    user.permissions = perms;
    await user.save();
    res.json({ success: true, message: `Role '${role}' applied`, data: user.permissions });
  } catch (error) {
    res.status(500).json({ success: false, message: "Internal server error", error: error.message });
  }
};
