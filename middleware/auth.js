// middleware/auth.js
const jwt = require("jsonwebtoken");
const User = require("../models/user");
const { verifyToken } = require("../config/jwt");

const authenticate = async (req, res, next) => {
  try {
    let token;
    
    // Check for token in Authorization header
    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer")
    ) {
      token = req.headers.authorization.split(" ")[1];
    }
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: token missing",
      });
    }
    
    // Verify token
    const decoded = verifyToken(token);

    // Get user from database
    const user = await User.findById(decoded.id).select("-password");
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: token user invalid",
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: "Forbidden: account deactivated",
      });
    }


    req.user = user;
    next();
  } catch (error) {
    const msg = error && error.name === 'TokenExpiredError'
      ? 'Unauthorized: token expired'
      : 'Unauthorized: token invalid';
    return res.status(401).json({
      success: false,
      message: msg,
    });
  }
};

const authorize = (...roles) => {
  return (req, res, next) => {
    // Allow super admin always
    if (req.user.userType === "super_admin") return next();

    // If a special role 'admin_with_ceo' is requested, require admin + isCEO flag
    if (roles.includes('admin_with_ceo')) {
      if (req.user.userType === 'admin' && req.user.ceo === true) return next();
      return res.status(403).json({ success: false, message: 'CEO privileges required.' });
    }

    if (!roles.includes(req.user.userType)) {
      return res.status(403).json({
        success: false,
        message: `User type '${req.user.userType}' is not authorized to access this resource.`,
      });
    }
    next();
  };
};

// ACL applies only to these roles
const ACL_APPLICABLE_ROLES = ["sales_agent", "sales_manager"];

const checkPermission = (module, action) => {
  return (req, res, next) => {
    // Super admin/admin bypass ACL checks
    if (req.user.userType === "super_admin" || req.user.userType === "admin") {
      return next();
    }

    // If user role is not within ACL scope, bypass
    if (!ACL_APPLICABLE_ROLES.includes(req.user.userType)) {
      return next();
    }

    const userPermissions = req.user.permissions || [];
    const modulePermission = userPermissions.find((p) => p.module === module);
    if (!modulePermission || !Array.isArray(modulePermission.actions) || !modulePermission.actions.includes(action)) {
      return res.status(403).json({
        success: false,
        message: `You don't have permission to ${action} ${module}.`,
      });
    }
    next();
  };
};

const isSuperAdmin = (req, res, next) => {
  if (req.user.userType !== "super_admin") {
    return res.status(403).json({
      success: false,
      message: "Access denied. Super admin privileges required.",
    });
  }
  next();
};

module.exports = {
  authenticate,
  authorize,
  checkPermission,
  isSuperAdmin,
  ACL_APPLICABLE_ROLES,
};
