const RTO = require("../models/rto");
const { logMe } = require("../utils/logger");

/**
 * RTO Context Middleware
 * Resolves RTO context from request headers, query params, or defaults
 */
const rtoContext = async (req, res, next) => {
  try {
    let rtoCode = null;
    
    // Priority order for RTO resolution:
    // 1. X-RTO header (for API calls)
    // 2. rto query parameter
    // 3. Domain-based resolution (for future multi-tenant)
    // 4. Default RTO
    
    if (req.headers['x-rto']) {
      rtoCode = req.headers['x-rto'];
    } else if (req.query.rto) {
      rtoCode = req.query.rto;
    } else {
      // Future: Add domain-based resolution here
      // const host = req.get('host');
      // rtoCode = await resolveRTOFromDomain(host);
    }
    
    // If no RTO specified, try to get default
    if (!rtoCode) {
      const defaultRTO = await RTO.getDefault();
      if (defaultRTO) {
        rtoCode = defaultRTO.rtoCode;
      }
    }
    
    if (!rtoCode) {
      return res.status(400).json({
        success: false,
        message: "RTO context is required. Please provide X-RTO header or rto query parameter."
      });
    }
    
    // Fetch RTO configuration
    const rto = await RTO.findByCode(rtoCode);
    
    if (!rto) {
      return res.status(404).json({
        success: false,
        message: `RTO with code '${rtoCode}' not found or inactive.`
      });
    }
    
    // Attach RTO context to request
    req.rto = rto;
    req.rtoCode = rtoCode;
    req.rtoConfig = {
      id: rto._id,
      code: rto.rtoCode,
      name: rto.name,
      shortName: rto.shortName,
      branding: rto.getBranding(),
      emailConfig: rto.getEmailConfig(),
      features: rto.features,
      timezone: rto.timezone,
      dateFormat: rto.dateFormat,
      currency: rto.currency
    };
    
    // Log RTO context for debugging
    logMe("rto_context.resolved", {
      rtoCode: rtoCode,
      rtoName: rto.name,
      userId: req.user?.id
    });
    
    next();
  } catch (error) {
    logMe("rto_context.error", error, "error");
    return res.status(500).json({
      success: false,
      message: "Error resolving RTO context",
      error: error.message
    });
  }
};

/**
 * Optional RTO Context Middleware
 * Same as above but doesn't fail if RTO not found - just attaches default
 */
const optionalRtoContext = async (req, res, next) => {
  try {
    let rtoCode = null;
    
    if (req.headers['x-rto']) {
      rtoCode = req.headers['x-rto'];
    } else if (req.query.rto) {
      rtoCode = req.query.rto;
    }
    
    if (rtoCode) {
      const rto = await RTO.findByCode(rtoCode);
      
      if (rto) {
        req.rto = rto;
        req.rtoCode = rtoCode;
        req.rtoConfig = {
          id: rto._id,
          code: rto.rtoCode,
          name: rto.name,
          shortName: rto.shortName,
          branding: rto.getBranding(),
          emailConfig: rto.getEmailConfig(),
          features: rto.features,
          timezone: rto.timezone,
          dateFormat: rto.dateFormat,
          currency: rto.currency
        };
      }
    }
    
    // Always try to attach default RTO if no specific one found
    if (!req.rto) {
      const defaultRTO = await RTO.getDefault();
      if (defaultRTO) {
        req.rto = defaultRTO;
        req.rtoCode = defaultRTO.rtoCode;
        req.rtoConfig = {
          id: defaultRTO._id,
          code: defaultRTO.rtoCode,
          name: defaultRTO.name,
          shortName: defaultRTO.shortName,
          branding: defaultRTO.getBranding(),
          emailConfig: defaultRTO.getEmailConfig(),
          features: defaultRTO.features,
          timezone: defaultRTO.timezone,
          dateFormat: defaultRTO.dateFormat,
          currency: defaultRTO.currency
        };
      }
    }
    
    next();
  } catch (error) {
    logMe("rto_context.optional_error", error, "error");
    // Continue without RTO context if there's an error
    next();
  }
};

/**
 * Feature Gate Middleware
 * Checks if a feature is enabled for the current RTO
 */
const requireFeature = (featureName) => {
  return (req, res, next) => {
    if (!req.rto) {
      return res.status(400).json({
        success: false,
        message: "RTO context required for feature check"
      });
    }
    
    if (!req.rto.isFeatureEnabled(featureName)) {
      return res.status(403).json({
        success: false,
        message: `Feature '${featureName}' is not enabled for this RTO`
      });
    }
    
    next();
  };
};

/**
 * Helper function to get RTO-specific branding
 */
const getRTOStyling = (req) => {
  if (!req.rtoConfig) return {};
  
  return {
    primaryColor: req.rtoConfig.branding.primaryColor,
    secondaryColor: req.rtoConfig.branding.secondaryColor,
    logo: req.rtoConfig.branding.logo,
    name: req.rtoConfig.branding.name,
    shortName: req.rtoConfig.branding.shortName,
    ceoName: req.rtoConfig.branding.ceoName
  };
};

module.exports = {
  rtoContext,
  optionalRtoContext,
  requireFeature,
  getRTOStyling
};
