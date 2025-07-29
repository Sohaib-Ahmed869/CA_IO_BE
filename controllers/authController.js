// controllers/authController.js
const User = require("../models/user");
const InitialScreeningForm = require("../models/initialScreeningForm");
const Certification = require("../models/certification");
const { generateToken } = require("../config/jwt");
const Payment = require("../models/payment");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const { sendEmail } = require("../services/emailService");
const crypto = require("crypto");
const EmailHelpers = require("../utils/emailHelpers");
const { rtoFilter } = require("../middleware/tenant");

const registerUser = async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      email,
      password,
      phoneNumber,
      phoneCode,
      questions,
      // Initial Screening Form data
      certificationId,
      workExperienceYears,
      workExperienceLocation,
      currentState,
      hasFormalQualifications,
      formalQualificationsDetails,
    } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ 
      email, 
      ...rtoFilter(req.rtoId) // Check within RTO context
    });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "User with this email already exists",
      });
    }

    // Verify certification exists
    const certification = await Certification.findById(certificationId);
    if (!certification) {
      return res.status(404).json({
        success: false,
        message: "Certification not found",
      });
    }

    // Create user with RTO context
    const user = await User.create({
      firstName,
      lastName,
      email,
      password,
      phoneNumber,
      phoneCode,
      questions: questions || "",
      userType: "user",
      rtoId: req.rtoId, // Add RTO context
      rtoRole: "user", // Default RTO role
    });

    // Create initial screening form with RTO context
    const initialScreeningForm = await InitialScreeningForm.create({
      userId: user._id,
      certificationId,
      rtoId: req.rtoId, // Add RTO context
      workExperienceYears,
      workExperienceLocation,
      currentState,
      hasFormalQualifications,
      formalQualificationsDetails: formalQualificationsDetails || "",
      status: "submitted",
      submittedAt: new Date(),
    });

    // Import Application model at the top of your file
    const Application = require("../models/application");

    // Create application with RTO context
    const application = await Application.create({
      userId: user._id,
      certificationId,
      rtoId: req.rtoId, // Add RTO context
      initialScreeningFormId: initialScreeningForm._id,
      overallStatus: "payment_pending", // Ready for payment 
      currentStep: 1,
    });

    // 🆕 ADD THIS SECTION - AUTO CREATE PAYMENT
    const Payment = require("../models/payment");
    const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

    // Create or get Stripe customer
    let customer;
    try {
      const existingCustomers = await stripe.customers.list({
        email: user.email,
        limit: 1,
      });

      if (existingCustomers.data.length > 0) {
        customer = existingCustomers.data[0];
      } else {
        customer = await stripe.customers.create({
          email: user.email,
          name: `${user.firstName} ${user.lastName}`,
          phone: user.phoneNumber,
        });
      }
    } catch (stripeError) {
      console.error("Stripe customer error:", stripeError);
      // Continue without Stripe customer - can be created later
    }

    // Create default one-time payment with RTO context
    const payment = await Payment.create({
      userId: user._id,
      applicationId: application._id,
      certificationId: certificationId,
      rtoId: req.rtoId, // Add RTO context
      paymentType: "one_time",
      totalAmount: certification.price,
      status: "pending",
      stripeCustomerId: customer?.id,
      metadata: {
        autoCreated: true,
        originalPrice: certification.price,
        createdDuringRegistration: true,
      },
    });

    // Update application with payment ID 
    await Application.findByIdAndUpdate(application._id, {
      paymentId: payment._id,
    });
    // 🆕 END OF PAYMENT CREATION SECTION

    const token = generateToken({
      id: user._id,
      email: user.email,
      userType: user.userType,
    });

    // Send response immediately
    res.status(201).json({
      success: true,
      message: "User registered successfully",
      data: {
        user: {
          id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          phoneNumber: user.phoneNumber,
          phoneCode: user.phoneCode,
          userType: user.userType,
        },
        initialScreeningForm: {
          id: initialScreeningForm._id,
          status: initialScreeningForm.status,
        },
        application: {
          id: application._id,
          status: application.overallStatus,
          currentStep: application.currentStep,
        },
        payment: {
          id: payment._id,
          type: payment.paymentType,
          amount: payment.totalAmount,
          status: payment.status,
        },
        token,
      },
    });

    // Send emails asynchronously after response
    setImmediate(async () => {
      try {
        await EmailHelpers.handleApplicationCreated(
          user,
          application,
          certification
        );
      } catch (emailError) {
        console.error("Async email sending error:", emailError);
      }
    });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({
      success: false,
      message: "Server error during registration",
    });
  }
};

// Admin Registration
const registerAdmin = async (req, res) => {
  try {
    const { firstName, lastName, email, password, phoneNumber,phoneCode } = req.body;

    // Check if admin already exists
    const existingAdmin = await User.findOne({ email });
    if (existingAdmin) {
      return res.status(400).json({
        success: false,
        message: "User with this email already exists",
      });
    }

    // Create admin user with full permissions
    const admin = await User.create({
      firstName,
      lastName,
      email,
      password,
      phoneNumber,
      phoneCode ,
      userType: "admin",
      permissions: [
        { module: "users", actions: ["read", "write", "update", "delete"] },
        {
          module: "certifications",
          actions: ["read", "write", "update", "delete"],
        },
        {
          module: "applications",
          actions: ["read", "write", "update", "delete"],
        },
        { module: "payments", actions: ["read", "write", "update", "delete"] },
        {
          module: "certificates",
          actions: ["read", "write", "update", "delete"],
        },
        { module: "reports", actions: ["read", "write", "update", "delete"] },
      ],
    });

    const token = generateToken({
      id: admin._id,
      email: admin.email,
      userType: admin.userType,
    });

    res.status(201).json({
      success: true,
      message: "Admin registered successfully",
      data: {
        user: {
          id: admin._id,
          firstName: admin.firstName,
          lastName: admin.lastName,
          email: admin.email,
          userType: admin.userType,
        },
        token,
      },
    });
  } catch (error) {
    console.error("Admin registration error:", error);
    res.status(500).json({
      success: false,
      message: "Server error during admin registration",
    });
  }
};

const registerSuperAdmin = async (req, res) => {
  try {
    const { firstName, lastName, email, password, phoneNumber, phoneCode } = req.body;

    // Check if super admin already exists
    const existingSuperAdmin = await User.findOne({ email });
    if (existingSuperAdmin) {
      return res.status(400).json({
        success: false,
        message: "User with this email already exists",
      });
    }

    // Create super admin user with all permissions (no rtoId for global access)
    const superAdmin = await User.create({
      firstName,
      lastName,
      email,
      password,
      phoneNumber,
      phoneCode,
      userType: "super_admin",
      rtoId: null, // Super admins are global users
      permissions: [
        { module: "users", actions: ["read", "write", "update", "delete"] },
        { module: "certifications", actions: ["read", "write", "update", "delete"] },
        { module: "applications", actions: ["read", "write", "update", "delete"] },
        { module: "payments", actions: ["read", "write", "update", "delete"] },
        { module: "certificates", actions: ["read", "write", "update", "delete"] },
        { module: "reports", actions: ["read", "write", "update", "delete"] },
        { module: "admin_management", actions: ["read", "write", "update", "delete"] },
        { module: "system_settings", actions: ["read", "write", "update", "delete"] },
        { module: "super_admin", actions: ["read", "write", "update", "delete"] },
      ],
    });

    const token = generateToken({
      id: superAdmin._id,
      email: superAdmin.email,
      userType: superAdmin.userType,
    });

    res.status(201).json({
      success: true,
      message: "Super Admin registered successfully",
      data: {
        user: {
          id: superAdmin._id,
          firstName: superAdmin.firstName,
          lastName: superAdmin.lastName,
          email: superAdmin.email,
          userType: superAdmin.userType,
        },
        token,
      },
    });
  } catch (error) {
    console.error("Super Admin registration error:", error);
    res.status(500).json({
      success: false,
      message: "Server error during super admin registration",
    });
  }
};

// Login
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user and include password for comparison
    const user = await User.findOne({ email }).select("+password");


    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: "Your account has been deactivated", 
      });
    }

    const token = generateToken({
      id: user._id,
      email: user.email,
      userType: user.userType,
    });


    res.json({
      success: true,
      message: "Login successful",
      data: {
        user: {
          id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          userType: user.userType,
          permissions: user.permissions,
          ceo: user.ceo === true,
        },
        token,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({
      success: false,
      message: "Server error during login",
    });
  }
};

// Get current user profile
const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    res.json({
      success: true,
      data: {
        user: {
          id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          phoneNumber: user.phoneNumber,
          phoneCode: user.phoneCode,
          userType: user.userType,
          permissions: user.permissions,
          isActive: user.isActive,
        },
      },
    });
  } catch (error) {
    console.error("Get profile error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.id;

    // Validation
    if (!currentPassword || !newPassword) {
      console.log("Current password and new password are required");
      return res.status(400).json({
        success: false,
        message: "Current password and new password are required",
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: "New password must be at least 6 characters long",
      });
    }

    // Get user with password field
    const user = await User.findById(userId).select("+password");
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Verify current password
    const isCurrentPasswordValid = await user.comparePassword(currentPassword);
    if (!isCurrentPasswordValid) {
      return res.status(400).json({
        success: false,
        message: "Current password is incorrect",
      });
    }

    // Update password (pre-save hook will hash it)
    user.password = newPassword;
    await user.save();

    res.json({
      success: true,
      message: "Password changed successfully",
    });
  } catch (error) {
    console.error("Change password error:", error);
    res.status(500).json({
      success: false,
      message: "Error changing password",
    });
  }
};

// Forgot Password
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required",
      });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "No account found with this email address",
      });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString("hex");
    const resetTokenExpiry = Date.now() + 10 * 60 * 1000; // 10 minutes

    // Save token to user
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = resetTokenExpiry;
    await user.save();

    // Create reset URL
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;

    // Email HTML template
    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Password Reset Request</h2>
        <p>Hi ${user.firstName},</p>
        <p>You requested to reset your password. Click the button below to reset it:</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetUrl}" style="background-color: #007bff; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Reset Password</a>
        </div>
        <p>Or copy and paste this link in your browser:</p>
        <p style="word-break: break-all; color: #007bff;">${resetUrl}</p>
        <p>This link will expire in 10 minutes.</p>
        <p>If you didn't request this, please ignore this email.</p>
        <hr style="margin: 30px 0;">
        <p style="color: #666; font-size: 12px;">Certified.io - Built for RTOs</p>
      </div>
    `;

    // Send email 
    await sendEmail(email, "Password Reset Request", htmlContent);

    res.json({
      success: true,
      message: "Password reset email sent successfully",
    });
  } catch (error) {
    console.error("Forgot password error:", error);
    res.status(500).json({
      success: false,
      message: "Error sending reset email",
    });
  }
};

// Reset Password
const resetPassword = async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Token and new password are required",
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters long",
      });
    }

    // Find user with valid token
    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired reset token",
      });
    }

    // Update password and clear reset fields
    user.password = newPassword;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    res.json({
      success: true,
      message: "Password reset successfully",
    });
  } catch (error) {
    console.error("Reset password error:", error);
    res.status(500).json({
      success: false,
      message: "Error resetting password",
    });
  }
};

// Get all users (Super Admin only)
const getAllUsers = async (req, res) => {
  try {
    const { page = 1, limit = 10, userType, search } = req.query;
    const skip = (page - 1) * limit;

    let query = {};

    // Filter by user type if provided
    if (userType) {
      query.userType = userType;
    }

    // Search functionality
    if (search) {
      query.$or = [
        { firstName: { $regex: search, $options: "i" } },
        { lastName: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
    }

    const users = await User.find({ ...rtoFilter(req.rtoId), ...query })
      .select("-password")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const totalUsers = await User.countDocuments({ ...rtoFilter(req.rtoId) });

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
      },
    });
  } catch (error) {
    console.error("Get all users error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching users",
    });
  }
};

// Update user status (Super Admin only)
const updateUserStatus = async (req, res) => {
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

    // Prevent super admin from deactivating themselves
    if (user.userType === "super_admin" && req.user._id.toString() === userId) {
      return res.status(400).json({
        success: false,
        message: "Super admin cannot deactivate their own account",
      });
    }

    user.isActive = isActive;
    await user.save();

    res.json({
      success: true,
      message: `User ${isActive ? "activated" : "deactivated"} successfully`,
      data: {
        user: {
          id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          userType: user.userType,
          isActive: user.isActive,
        },
      },
    });
  } catch (error) {
    console.error("Update user status error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while updating user status",
    });
  }
};

module.exports = {
  registerUser,
  registerAdmin,
  registerSuperAdmin,
  login,
  changePassword,
  getProfile,
  forgotPassword,
  resetPassword,
  getAllUsers,
  updateUserStatus,
};
