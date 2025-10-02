/**
 * Subdomain RTO Context Middleware
 * 
 * This middleware automatically resolves RTO context from subdomain
 * Example: azka12.certified.io -> RTO with subdomain "azka12"
 */

const RTO = require("../models/rto");
const { logMe } = require("../utils/logger");

const subdomainRtoContext = async (req, res, next) => {
  try {
    let rtoCode = null;
    let subdomain = null;
    
    // Get host for logging purposes
    const host = req.get('host') || req.get('x-forwarded-host') || '';

    // Extract subdomain from frontend headers (sent by frontend based on subdomain detection)
    const frontendSubdomain = req.headers['x-frontend-subdomain'];
    const frontendHost = req.headers['x-frontend-host'];
    
    // Debug logging
    logMe("subdomain.debug", {
      frontendSubdomain,
      frontendHost,
      host,
      url: req.url,
      headers: {
        'x-frontend-subdomain': req.headers['x-frontend-subdomain'],
        'x-frontend-host': req.headers['x-frontend-host'],
        'x-rto': req.headers['x-rto']
      },
      query: req.query
    });
    
    // Frontend sends the subdomain it detected
    if (frontendSubdomain && frontendSubdomain !== 'main' && frontendSubdomain !== 'admin') {
      subdomain = frontendSubdomain;
      rtoCode = subdomain;
      logMe("subdomain.using_frontend_header", { frontendSubdomain, subdomain, rtoCode });
    } else {
      // Fallback to host-based detection for direct API calls
      if (host.includes('certified.io') && !host.startsWith('www.')) {
        // Production subdomain format
        const parts = host.split('.');
        if (parts.length >= 3) {
          subdomain = parts[0];
          rtoCode = subdomain;
        }
      } else if (host.includes('localhost') || host.includes('127.0.0.1')) {
        // Development - check for custom header or query param
        rtoCode = req.headers['x-rto'] || req.query.rto;
        subdomain = rtoCode;
      }
    }

    let rtoConfig;
    if (rtoCode) {
      // Try to find RTO by code (assuming subdomain matches RTO code)
      rtoConfig = await RTO.findByCode(rtoCode);
      
      if (!rtoConfig) {
        // If not found by code, try to find by subdomain in contact.website
        rtoConfig = await RTO.findOne({
          'contact.website': { $regex: `.*${subdomain}.*`, $options: 'i' }
        });
      }

      if (!rtoConfig) {
        logMe("subdomain.rto.not_found", { subdomain, rtoCode, host }, "warn");
        return res.status(404).json({
          success: false,
          message: `RTO not found for subdomain: ${subdomain}`,
          error: "RTO_NOT_FOUND"
        });
      }

      logMe("subdomain.rto.resolved", {
        subdomain,
        rtoCode: rtoConfig.rtoCode,
        rtoName: rtoConfig.name,
        host
      });
    } else {
      // No subdomain detected - this is ADMIN PORTAL access (no RTO context)
      // Frontend detected main domain (localhost:5173, stage.certified.io, etc.)
      rtoConfig = null;
      
      logMe("subdomain.admin_portal_access", {
        frontendSubdomain,
        frontendHost,
        userType: req.user?.userType || 'unauthenticated',
        userId: req.user?._id || 'none'
      });
    }

    // Attach RTO context to request
    req.rtoConfig = rtoConfig;
    req.subdomain = subdomain;
    req.rto = {
      isFeatureEnabled: (featureName) => {
        return rtoConfig?.features?.[featureName] === true;
      }
    };

    // Add RTO context to response headers for frontend
    if (rtoConfig) {
      res.setHeader('X-RTO-Code', rtoConfig.rtoCode);
      res.setHeader('X-RTO-Name', rtoConfig.name);
      res.setHeader('X-RTO-Subdomain', subdomain || 'default');
    } else {
      // Admin portal access - no RTO context
      res.setHeader('X-RTO-Code', 'admin');
      res.setHeader('X-RTO-Name', 'Admin Portal');
      res.setHeader('X-RTO-Subdomain', 'main');
    }

    next();
  } catch (error) {
    logMe("subdomain.rto.context.error", error, "error");
    res.status(500).json({
      success: false,
      message: "Error resolving RTO context from subdomain",
      error: error.message
    });
  }
};

const optionalSubdomainRtoContext = async (req, res, next) => {
  try {
    await subdomainRtoContext(req, res, next);
  } catch (error) {
    // Continue without RTO context if subdomain resolution fails
    logMe("subdomain.rto.optional.error", error, "warn");
    next();
  }
};

module.exports = { subdomainRtoContext, optionalSubdomainRtoContext };
