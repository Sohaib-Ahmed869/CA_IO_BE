// controllers/authController.js
const User = require("../models/user");
const InitialScreeningForm = require("../models/initialScreeningForm");
const Certification = require("../models/certification");
const { generateToken } = require("../config/jwt");

// User Registration with Initial Screening Form
const registerUser = async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      email,
      password,
      phoneNumber,
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
    const existingUser = await User.findOne({ email });
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

    // Create user
    const user = await User.create({
      firstName,
      lastName,
      email,
      password,
      phoneNumber,
      questions: questions || "",
      userType: "user",
    });

    // Create initial screening form
    const initialScreeningForm = await InitialScreeningForm.create({
      userId: user._id,
      certificationId,
      workExperienceYears,
      workExperienceLocation,
      currentState,
      hasFormalQualifications,
      formalQualificationsDetails: formalQualificationsDetails || "",
      status: "submitted",
      submittedAt: new Date(),
    });

    // 🆕 ADD THIS: Import Application model at the top of your file
    const Application = require("../models/application");
    
    // 🆕 ADD THIS: Create application
    const application = await Application.create({
      userId: user._id,
      certificationId,
      initialScreeningFormId: initialScreeningForm._id,
      overallStatus: "payment_pending", // Ready for payment
      currentStep: 1,
    });

    // Generate JWT token
    const token = generateToken({
      id: user._id,
      email: user.email,
      userType: user.userType,
    });

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
          userType: user.userType,
        },
        initialScreeningForm: {
          id: initialScreeningForm._id,
          status: initialScreeningForm.status,
        },
        // 🆕 ADD THIS: Return application data
        application: {
          id: application._id,
          status: application.overallStatus,
          currentStep: application.currentStep,
        },
        token,
      },
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
    const { firstName, lastName, email, password, phoneNumber } = req.body;

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

module.exports = {
  registerUser,
  registerAdmin,
  login,
  getProfile,
};
