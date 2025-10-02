/**
 * RTO Context Utilities
 * 
 * Utility functions for handling RTO context throughout the application
 */

const { logMe } = require('./logger');

/**
 * Get RTO context from request
 */
const getRtoContext = (req) => {
  const hasSubdomain = !!req.subdomain;
  const isAdminAccess = !hasSubdomain; // No subdomain = admin access
  
  return {
    rtoId: req.rtoConfig?._id,
    rtoCode: req.rtoConfig?.rtoCode,
    rtoName: req.rtoConfig?.name,
    subdomain: req.subdomain,
    isAdminAccess: isAdminAccess,
    hasSubdomain: hasSubdomain,
    userType: req.user?.userType,
    isFeatureEnabled: (featureName) => {
      return req.rtoConfig?.features?.[featureName] === true;
    }
  };
};

/**
 * Add RTO context to database queries
 */
const addRtoContextToQuery = (query, rtoId, isAdminAccess = false) => {
  // If admin access, don't filter by RTO (show all data)
  if (!isAdminAccess && rtoId) {
    query.rtoId = rtoId;
  }
  return query;
};

/**
 * Add RTO context to new documents
 */
const addRtoContextToDocument = (document, rtoId) => {
  if (rtoId) {
    document.rtoId = rtoId;
  }
  return document;
};

/**
 * Validate RTO context exists
 */
const validateRtoContext = (req, res, next) => {
  if (!req.rtoConfig) {
    return res.status(400).json({
      success: false,
      message: "RTO context is required but not found",
      error: "MISSING_RTO_CONTEXT"
    });
  }
  next();
};

/**
 * Get RTO branding information
 */
const getRtoBranding = (rtoConfig) => {
  return {
    name: rtoConfig.name,
    shortName: rtoConfig.shortName,
    logo: rtoConfig.logo,
    primaryColor: rtoConfig.primaryColor,
    secondaryColor: rtoConfig.secondaryColor,
    contact: rtoConfig.contact,
    timezone: rtoConfig.timezone,
    currency: rtoConfig.currency
  };
};

/**
 * Get RTO email configuration
 */
const getRtoEmailConfig = (rtoConfig) => {
  return rtoConfig.emailConfig;
};

/**
 * Log RTO context activity
 */
const logRtoActivity = (activity, req, additionalData = {}) => {
  const rtoContext = getRtoContext(req);
  logMe(`rto.activity.${activity}`, {
    ...rtoContext,
    ...additionalData,
    userAgent: req.get('User-Agent'),
    ip: req.ip
  });
};

/**
 * Create RTO-specific response headers
 */
const addRtoResponseHeaders = (res, rtoConfig) => {
  if (rtoConfig) {
    res.setHeader('X-RTO-Code', rtoConfig.rtoCode);
    res.setHeader('X-RTO-Name', rtoConfig.name);
    res.setHeader('X-RTO-Primary-Color', rtoConfig.primaryColor);
    res.setHeader('X-RTO-Secondary-Color', rtoConfig.secondaryColor);
    if (rtoConfig.logo?.url) {
      res.setHeader('X-RTO-Logo', rtoConfig.logo.url);
    }
  }
};

/**
 * Filter data by RTO context
 */
const filterByRtoContext = (data, rtoId) => {
  if (!rtoId) return data;
  
  if (Array.isArray(data)) {
    return data.filter(item => {
      if (typeof item === 'object' && item !== null) {
        return item.rtoId?.toString() === rtoId.toString();
      }
      return false;
    });
  }
  
  if (typeof data === 'object' && data !== null) {
    return data.rtoId?.toString() === rtoId.toString() ? data : null;
  }
  
  return data;
};

/**
 * Populate RTO context in responses
 */
const populateRtoContext = (req, data) => {
  const rtoContext = getRtoContext(req);
  
  if (Array.isArray(data)) {
    return data.map(item => ({
      ...item,
      rtoContext: rtoContext
    }));
  }
  
  if (typeof data === 'object' && data !== null) {
    return {
      ...data,
      rtoContext: rtoContext
    };
  }
  
  return data;
};

module.exports = {
  getRtoContext,
  addRtoContextToQuery,
  addRtoContextToDocument,
  validateRtoContext,
  getRtoBranding,
  getRtoEmailConfig,
  logRtoActivity,
  addRtoResponseHeaders,
  filterByRtoContext,
  populateRtoContext
};
