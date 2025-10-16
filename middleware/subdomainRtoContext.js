/**
 * Subdomain RTO Context Middleware
 * 
 * Multi-tenancy middleware that resolves RTO context from frontend subdomain detection.
 * The frontend detects the subdomain from the user's browser URL and sends it via headers.
 * 
 * Priority:
 * 1. Frontend subdomain header (x-frontend-subdomain) - PRIMARY for multi-tenancy
 * 2. Host-based detection - FALLBACK for direct API calls
 * 
 * Default domains (not treated as RTO subdomains):
 * - main, admin, tenancy, tenancy-staging, tenancy-stage
 * These domains will be treated as admin portal access without RTO context
 * 
 * Example: Frontend at azka12.certified.io sends x-frontend-subdomain: azka12
 * API can be hosted anywhere (tenancy-stage.certified.io) but RTO context = "azka12"
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
      isDefaultDomain: frontendSubdomain && ['main', 'admin', 'tenancy', 'tenancy-staging'].includes(frontendSubdomain),
      headers: {
        'x-frontend-subdomain': req.headers['x-frontend-subdomain'],
        'x-frontend-host': req.headers['x-frontend-host'],
        'x-rto': req.headers['x-rto']
      },
      query: req.query
    });
    
    // Default domains that should not be treated as RTO subdomains
    const defaultDomains = ['main', 'admin', 'tenancy', 'tenancy-staging', 'tenancy-stage'];
    
    // Multi-tenancy: Frontend subdomain detection takes priority
    // Frontend sends the subdomain it detected from the user's browser URL
    if (frontendSubdomain) {
      if (!defaultDomains.includes(frontendSubdomain)) {
        // Valid RTO subdomain from frontend
        subdomain = frontendSubdomain;
        rtoCode = subdomain;
        logMe("subdomain.using_frontend_header", { 
          frontendSubdomain, 
          subdomain, 
          rtoCode, 
          apiHost: host,
          reason: "Multi-tenancy: Frontend subdomain detection"
        });
      } else {
        // Frontend detected a default domain
        logMe("subdomain.frontend_default_domain", { 
          frontendSubdomain, 
          host,
          reason: "Frontend detected default domain - admin portal access" 
        });
        // No RTO context for default domains
        subdomain = null;
        rtoCode = null;
      }
    } else {
      // No frontend subdomain header - fallback to host-based detection for direct API calls
      if (host.includes('certified.io') && !host.startsWith('www.')) {
        const parts = host.split('.');
        if (parts.length >= 3) {
          const detectedSubdomain = parts[0];
          if (!defaultDomains.includes(detectedSubdomain)) {
            subdomain = detectedSubdomain;
            rtoCode = subdomain;
            logMe("subdomain.fallback_host_detection", { 
              detectedSubdomain, 
              host, 
              reason: "Fallback: No frontend header, using host-based detection" 
            });
          } else {
            logMe("subdomain.host_default_domain", { 
              detectedSubdomain, 
              host, 
              reason: "Host-based default domain detection" 
            });
          }
        }
      } else if (host.includes('localhost') || host.includes('127.0.0.1')) {
        // Development - check for custom header or query param
        rtoCode = req.headers['x-rto'] || req.query.rto;
        subdomain = rtoCode;
        logMe("subdomain.development_fallback", { rtoCode, subdomain, host });
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
      // No subdomain detected or default domain - this is ADMIN PORTAL access (no RTO context)
      // Frontend detected main domain or default domain (localhost:5173, tenancy.certified.io, etc.)
      rtoConfig = null;
      
      logMe("subdomain.admin_portal_access", {
        frontendSubdomain,
        frontendHost,
        host,
        isDefaultDomain: frontendSubdomain && defaultDomains.includes(frontendSubdomain),
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
