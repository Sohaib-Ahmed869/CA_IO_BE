// controllers/userController.js
const User = require("../models/user");
const logme = require("../utils/logger");
const { rtoFilter } = require("../middleware/tenant");

const userController = {
  // Get all users (with filtering and pagination)
  getAllUsers: async (req, res) => {
    try {
      const { 
        page = 1, 
        limit = 10, 
        search, 
        userType, 
        status, 
        rtoId,
        sortBy = "createdAt", 
        sortOrder = "desc" 
      } = req.query;

      // Build query
      let query = {};
      
      // RTO filtering
      if (rtoId) {
        query.rtoId = rtoId;
      } else if (req.rtoId) {
        query.rtoId = req.rtoId;
      }

      // User type filtering
      if (userType && userType !== "all") {
        query.userType = userType;
      }

      // Status filtering
      if (status === "active") {
        query.isActive = true;
      } else if (status === "inactive") {
        query.isActive = false;
      }

      // Search filtering
      if (search) {
        query.$or = [
          { firstName: { $regex: search, $options: "i" } },
          { lastName: { $regex: search, $options: "i" } },
          { email: { $regex: search, $options: "i" } },
        ];
      }

      // Build sort object
      const sortObject = {};
      sortObject[sortBy] = sortOrder === "desc" ? -1 : 1;

      // Execute query with pagination
      const users = await User.find(query)
        .select("-password")
        .populate("rtoId", "companyName subdomain")
        .limit(limit * 1)
        .skip((page - 1) * limit)
        .sort(sortObject);

      // Get total count
      const total = await User.countDocuments(query);

      res.json({
        success: true,
        data: {
          users,
          pagination: {
            current: parseInt(page),
            pages: Math.ceil(total / limit),
            total,
          },
        },
      });
    } catch (error) {
      logme.error("Get all users error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching users",
      });
    }
  },

  // Get user by ID
  getUserById: async (req, res) => {
    try {
      const { userId } = req.params;
      
      const user = await User.findById(userId)
        .select("-password")
        .populate("rtoId", "companyName subdomain");

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      res.json({
        success: true,
        data: user,
      });
    } catch (error) {
      logme.error("Get user by ID error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching user",
      });
    }
  },

  // Create new user
  createUser: async (req, res) => {
    try {
      const { 
        firstName, 
        lastName, 
        email, 
        password, 
        phoneNumber, 
        phoneCode, 
        userType, 
        rtoId,
        rtoRole,
        permissions,
        ceo
      } = req.body;

      // Validate required fields
      if (!firstName || !lastName || !email || !password) {
        return res.status(400).json({
          success: false,
          message: "First name, last name, email, and password are required",
        });
      }

      // Check if user already exists with this email in the same RTO
      const existingUser = await User.findOne({ 
        email, 
        rtoId: rtoId || req.rtoId 
      });
      
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: "User with this email already exists in this RTO",
        });
      }

      // Validate RTO exists and is active if rtoId is provided
      if (rtoId) {
        const RTO = require("../models/rto");
        const rto = await RTO.findOne({ _id: rtoId, isActive: true });
        if (!rto) {
          return res.status(400).json({
            success: false,
            message: "RTO not found or inactive",
          });
        }
      }

      // Create user
      const user = new User({
        firstName,
        lastName,
        email,
        password,
        phoneNumber,
        phoneCode,
        userType: userType || "user",
        rtoId: rtoId || req.rtoId,
        rtoRole: rtoRole || userType || "user",
        permissions: permissions || [],
        ceo: ceo || false,
        isActive: true,
      });

      await user.save();

      // Remove password from response
      const userResponse = user.toObject();
      delete userResponse.password;

      res.status(201).json({
        success: true,
        message: "User created successfully",
        data: userResponse,
      });
    } catch (error) {
      logme.error("Create user error:", error);
      res.status(400).json({
        success: false,
        message: "Error creating user",
        error: error.message,
      });
    }
  },

  // Update user
  updateUser: async (req, res) => {
    try {
      const { userId } = req.params;
      const updateData = req.body;

      // Remove sensitive fields that shouldn't be updated directly
      delete updateData.password;
      delete updateData.email; // Email should be updated through a separate endpoint
      delete updateData.userType; // User type should be updated through permissions endpoint

      // Validate user exists
      const existingUser = await User.findById(userId);
      if (!existingUser) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      // Validate RTO exists and is active if rtoId is being updated
      if (updateData.rtoId) {
        const RTO = require("../models/rto");
        const rto = await RTO.findOne({ _id: updateData.rtoId, isActive: true });
        if (!rto) {
          return res.status(400).json({
            success: false,
            message: "RTO not found or inactive",
          });
        }
      }

      // Update user
      const updatedUser = await User.findByIdAndUpdate(
        userId,
        updateData,
        { new: true, runValidators: true }
      ).select("-password");

      res.json({
        success: true,
        message: "User updated successfully",
        data: updatedUser,
      });
    } catch (error) {
      logme.error("Update user error:", error);
      res.status(400).json({
        success: false,
        message: "Error updating user",
        error: error.message,
      });
    }
  },

  // Delete user (soft delete)
  deleteUser: async (req, res) => {
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

      // Soft delete - set isActive to false
      await User.findByIdAndUpdate(userId, {
        isActive: false,
        deletedAt: new Date()
      });

      res.json({
        success: true,
        message: "User soft deleted successfully",
        data: {
          userId: user._id,
          email: user.email,
          deletedAt: new Date()
        }
      });
    } catch (error) {
      logme.error("Delete user error:", error);
      res.status(500).json({
        success: false,
        message: "Error deleting user",
      });
    }
  },

  // Restore user (undo soft delete)
  restoreUser: async (req, res) => {
    try {
      const { userId } = req.params;

      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      // Restore user - set isActive to true
      await User.findByIdAndUpdate(userId, {
        isActive: true,
        deletedAt: null
      });

      res.json({
        success: true,
        message: "User restored successfully",
        data: {
          userId: user._id,
          email: user.email,
          isActive: true
        }
      });
    } catch (error) {
      logme.error("Restore user error:", error);
      res.status(500).json({
        success: false,
        message: "Error restoring user",
      });
    }
  },

  // Update user permissions
  updateUserPermissions: async (req, res) => {
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
      logme.error("Update user permissions error:", error);
      res.status(500).json({
        success: false,
        message: "Error updating user permissions",
      });
    }
  },

  // Update user status (active/inactive)
  updateUserStatus: async (req, res) => {
    try {
      const { userId } = req.params;
      const { isActive } = req.body;

      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      // Prevent deactivating super admin
      if (user.userType === "super_admin" && !isActive) {
        return res.status(400).json({
          success: false,
          message: "Cannot deactivate super admin user",
        });
      }

      // Prevent deactivating self
      if (req.user._id.toString() === userId && !isActive) {
        return res.status(400).json({
          success: false,
          message: "Cannot deactivate your own account",
        });
      }

      user.isActive = isActive;
      if (!isActive) {
        user.deletedAt = new Date();
      } else {
        user.deletedAt = null;
      }
      await user.save();

      res.json({
        success: true,
        message: `User ${isActive ? 'activated' : 'deactivated'} successfully`,
        data: {
          userId: user._id,
          email: user.email,
          isActive: user.isActive
        }
      });
    } catch (error) {
      logme.error("Update user status error:", error);
      res.status(500).json({
        success: false,
        message: "Error updating user status",
      });
    }
  },

  // Change user password
  changeUserPassword: async (req, res) => {
    try {
      const { userId } = req.params;
      const { newPassword } = req.body;

      if (!newPassword || newPassword.length < 6) {
        return res.status(400).json({
          success: false,
          message: "New password must be at least 6 characters long",
        });
      }

      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      // Update password (pre-save hook will hash it)
      user.password = newPassword;
      await user.save();

      res.json({
        success: true,
        message: "User password changed successfully",
      });
    } catch (error) {
      logme.error("Change user password error:", error);
      res.status(500).json({
        success: false,
        message: "Error changing user password",
      });
    }
  },
};

module.exports = userController; 