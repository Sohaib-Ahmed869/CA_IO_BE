const User = require("../models/user");
const bcrypt = require("bcryptjs");

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
