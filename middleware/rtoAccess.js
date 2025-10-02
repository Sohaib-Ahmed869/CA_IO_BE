/**
 * RTO Access Middleware
 * Validates if a user has access to the current RTO context
 */

const { logMe } = require('../utils/logger');

/**
 * Validates RTO access based on user's RTO membership
 */
const validateRTOAccess = (req, res, next) => {
  try {
    const { rtoConfig } = req;
    const { user } = req;
    
    // If no RTO context (admin portal), allow all authenticated users
    if (!rtoConfig) {
      logMe("rto.access.admin_portal", {
        userId: user?._id,
        userType: user?.userType
      });
      return next();
    }
    
    // If RTO context exists, validate user belongs to this RTO
    if (rtoConfig && user) {
      // Check if user belongs to this RTO
      const userRtoId = user.rtoId?.toString();
      const contextRtoId = rtoConfig._id?.toString();
      
      if (userRtoId !== contextRtoId) {
        logMe("rto.access.denied", {
          userId: user._id,
          userEmail: user.email,
          userRtoId: userRtoId,
          contextRtoId: contextRtoId,
          rtoCode: rtoConfig.rtoCode,
          rtoName: rtoConfig.name
        }, "warn");
        
        return res.status(403).json({
          success: false,
          message: `Access denied. You don't have permission to access ${rtoConfig.name} (${rtoConfig.rtoCode}).`,
          error: "RTO_ACCESS_DENIED",
          details: {
            requestedRTO: {
              id: rtoConfig._id,
              code: rtoConfig.rtoCode,
              name: rtoConfig.name
            },
            userRTO: userRtoId
          }
        });
      }
      
      logMe("rto.access.granted", {
        userId: user._id,
        userEmail: user.email,
        rtoCode: rtoConfig.rtoCode,
        rtoName: rtoConfig.name
      });
    }
    
    next();
  } catch (error) {
    logMe("rto.access.error", error, "error");
    res.status(500).json({
      success: false,
      message: "Error validating RTO access",
      error: error.message
    });
  }
};

/**
 * Middleware that allows admin access to any RTO (for certified-admin users)
 */
const allowAdminRTOAccess = (req, res, next) => {
  try {
    const { rtoConfig } = req;
    const { user } = req;
    
    // If no RTO context (admin portal), proceed
    if (!rtoConfig) {
      return next();
    }
    
    // If user is certified-admin, allow access to any RTO
    if (user?.userType === 'certified-admin') {
      logMe("rto.access.admin_override", {
        userId: user._id,
        userEmail: user.email,
        userType: user.userType,
        rtoCode: rtoConfig.rtoCode,
        rtoName: rtoConfig.name
      });
      return next();
    }
    
    // For non-admin users, validate normal RTO access
    return validateRTOAccess(req, res, next);
  } catch (error) {
    logMe("rto.access.admin.error", error, "error");
    res.status(500).json({
      success: false,
      message: "Error validating admin RTO access",
      error: error.message
    });
  }
};

module.exports = {
  validateRTOAccess,
  allowAdminRTOAccess
};

