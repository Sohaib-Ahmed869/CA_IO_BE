// middleware/auth.js
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const User = require("../models/user");
const { verifyToken } = require("../config/jwt");
const { logMe } = require("../utils/logger");

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

    // Validate decoded token has required fields
    if (!decoded || !decoded.id) {
      logMe("auth.invalid_token_payload", { decoded }, "warn");
      return res.status(401).json({
        success: false,
        message: "Unauthorized: token payload invalid",
      });
    }

    // Validate that decoded.id is a valid MongoDB ObjectId
    if (!mongoose.Types.ObjectId.isValid(decoded.id)) {
      logMe("auth.invalid_user_id_format", {
        userId: decoded.id,
        email: decoded.email,
        userType: decoded.userType
      }, "warn");
      return res.status(401).json({
        success: false,
        message: "Unauthorized: invalid user ID format",
      });
    }

    // Get user from database - for certified-admin users, they can access across RTOs
    // so we don't filter by rtoId here
    let user = await User.findById(decoded.id).select("-password");
    
    // Fallback: if user not found by ID, try finding by email (in case user was recreated or ID changed)
    if (!user && decoded.email) {
      logMe("auth.user_not_found_by_id_fallback_email", {
        userId: decoded.id,
        email: decoded.email,
        userType: decoded.userType
      }, "warn");
      user = await User.findOne({ email: decoded.email.toLowerCase() }).select("-password");
    }
    
    if (!user) {
      logMe("auth.user_not_found", {
        userId: decoded.id,
        email: decoded.email,
        userType: decoded.userType,
        url: req.url,
        method: req.method
      }, "warn");
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

    // Extract RTO ID from token if present (for RTO-specific scoping)
    // The rtoId in token takes precedence over user.rtoId for RTO context scoping
    // This allows users to access data specific to the RTO they logged in through
    // Convert user to plain object for consistent access
    const userObj = user.toObject ? user.toObject() : user;
    
    // Use rtoId from token if present (most accurate), otherwise use from user record
    // For certified-admin and super_admin, rtoId can be null (they can access all RTOs)
    const rtoId = decoded.rtoId || userObj.rtoId;
    
    // Ensure both id and _id are available for compatibility (codebase uses both)
    // Attach user object to request with rtoId for RTO-specific scoping
    req.user = { 
      ...userObj, 
      rtoId,
      id: userObj._id || userObj.id, // Ensure 'id' alias exists for compatibility
    };
    
    // For certified-admin users, allow access regardless of RTO context
    // Other users may need RTO validation (handled in route-specific middleware)
    next();
  } catch (error) {
    const msg = error && error.name === 'TokenExpiredError'
      ? 'Unauthorized: token expired'
      : 'Unauthorized: token invalid';
    logMe("auth.authenticate_error", { 
      message: error?.message, 
      name: error?.name,
      url: req.url,
      method: req.method
    }, "error");
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

    // Allow "admin" users to access "certified-admin" routes (they're equivalent)
    const userRoles = [req.user.userType];
    if (req.user.userType === 'admin' && roles.includes('certified-admin')) {
      userRoles.push('certified-admin');
    }
    if (req.user.userType === 'certified-admin' && roles.includes('admin')) {
      userRoles.push('admin');
    }

    if (!roles.some(role => userRoles.includes(role))) {
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
