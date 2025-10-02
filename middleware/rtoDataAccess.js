/**
 * RTO Data Access Middleware
 * Allows access to RTO data when accessing RTO-specific subdomain
 */

const { logMe } = require('../utils/logger');

/**
 * Allows RTO data access when user is accessing RTO-specific subdomain
 * This is needed for displaying RTO branding, info, etc. on frontend
 */
const allowRTODataAccess = (req, res, next) => {
  try {
    const { rtoConfig } = req;
    const { user } = req;
    
    // If no RTO context (admin portal), proceed normally
    if (!rtoConfig) {
      return next();
    }
    
    // If RTO context exists, allow access for:
    // 1. Users who belong to this RTO
    // 2. Anyone accessing the RTO's subdomain (for public RTO data display)
    
    const userRtoId = user?.rtoId?.toString();
    const contextRtoId = rtoConfig._id?.toString();
    
    // Allow access if:
    // - User belongs to this RTO, OR
    // - User is accessing RTO data via subdomain (for public display)
    if (userRtoId === contextRtoId || req.subdomain) {
      logMe("rto.data_access.granted", {
        userId: user?._id,
        userEmail: user?.email,
        userRtoId: userRtoId,
        contextRtoId: contextRtoId,
        rtoCode: rtoConfig.rtoCode,
        rtoName: rtoConfig.name,
        subdomain: req.subdomain,
        reason: userRtoId === contextRtoId ? 'user_belongs_to_rto' : 'subdomain_access'
      });
      return next();
    }
    
    // Block access for users who don't belong to this RTO and aren't accessing via subdomain
    logMe("rto.data_access.denied", {
      userId: user._id,
      userEmail: user.email,
      userRtoId: userRtoId,
      contextRtoId: contextRtoId,
      rtoCode: rtoConfig.rtoCode,
      rtoName: rtoConfig.name,
      subdomain: req.subdomain
    }, "warn");
    
    return res.status(403).json({
      success: false,
      message: `Access denied. You don't have permission to access ${rtoConfig.name} (${rtoConfig.rtoCode}).`,
      error: "RTO_DATA_ACCESS_DENIED",
      details: {
        requestedRTO: {
          id: rtoConfig._id,
          code: rtoConfig.rtoCode,
          name: rtoConfig.name
        },
        userRTO: userRtoId
      }
    });
  } catch (error) {
    logMe("rto.data_access.error", error, "error");
    res.status(500).json({
      success: false,
      message: "Error validating RTO data access",
      error: error.message
    });
  }
};

module.exports = {
  allowRTODataAccess
};
