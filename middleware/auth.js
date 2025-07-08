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
        message: "Access denied. No token provided.",
      });
    }
    
    // Verify token
    const decoded = verifyToken(token);

    // Get user from database
    const user = await User.findById(decoded.id).select("-password");
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Token is valid but user not found.",
      });
    }

    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: "User account is deactivated.",
      });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Token is not valid.",
    });
  }
};

const authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.userType)) {
      return res.status(403).json({
        success: false,
        message: `User type '${req.user.userType}' is not authorized to access this resource.`,
      });
    }
    next();
  };
};

const checkPermission = (module, action) => {
  
  return (req, res, next) => {
    const userPermissions = req.user.permissions || [];
    const modulePermission = userPermissions.find((p) => p.module === module);

    if (!modulePermission || !modulePermission.actions.includes(action)) {
      return res.status(403).json({
        success: false,
        message: `You don't have permission to ${action} ${module}.`,
      });
    }

    next();
  };
};

module.exports = {
  authenticate,
  authorize,
  checkPermission,
};
