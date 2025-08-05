// middleware/subdomainMiddleware.js
const RTO = require("../models/rto");
const User = require("../models/user");
const logme = require("../utils/logger");
const { shouldSkipSubdomain } = require("../config/constants");

const getRTOFromSubdomain = async (req, res, next) => {
  try {
    const hostname = req.hostname;
    const subdomain = hostname.split('.')[0];
    
    // Skip for global/system subdomains
    if (shouldSkipSubdomain(subdomain)) {
      // Check for subdomain in headers or query parameters as fallback
      const headerSubdomain = req.headers['x-subdomain'] || req.headers['x-rto-subdomain'];
      const querySubdomain = req.query.subdomain;
      
      if (headerSubdomain || querySubdomain) {
        const fallbackSubdomain = headerSubdomain || querySubdomain;
        logme.debug('Using fallback subdomain', { fallbackSubdomain });
        
        let rto = await RTO.findOne({ subdomain: fallbackSubdomain, isActive: true });
        
        if (rto) {
          req.rtoContext = {
            rtoId: rto._id,
            subdomain: fallbackSubdomain,
            rto: rto,
            isRTO: true
          };
          req.rtoId = rto._id;
          req.rto = rto;
          logme.debug('RTO identified from fallback', { subdomain: fallbackSubdomain, rtoId: rto._id });
          return next();
        }
      }
      
      req.rtoContext = null;
      return next();
    }
    
    // ANY other subdomain is treated as an RTO
    let rto = await RTO.findOne({ subdomain: subdomain, isActive: true });
    
    if (!rto) {
      // Create RTO automatically if it doesn't exist
      const companyName = subdomain
        .replace(/([A-Z])/g, ' $1') // Add space before capital letters
        .replace(/^./, str => str.toUpperCase()) // Capitalize first letter
        .replace(/-/g, ' ') // Replace hyphens with spaces
        .replace(/_/g, ' '); // Replace underscores with spaces
      
      const rtoData = {
        subdomain: subdomain,
        companyName: companyName,
        ceoName: "Auto Generated",
        ceoCode: subdomain.toUpperCase().substring(0, 3) + "001",
        email: `admin@${subdomain}.com`,
        phone: "+1234567890",
        rtoNumber: "AUTO" + Math.random().toString(36).substring(2, 8).toUpperCase(),
        registrationDate: new Date(),
        expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year from now
        isActive: true,
        isVerified: true,
        settings: {
          features: {
            assessors: true,
            salesAgents: false,
            certificates: true,
            formTemplates: true
          }
        }
      };

      // Add createdBy if user is authenticated
      if (req.user && req.user._id) {
        rtoData.createdBy = req.user._id;
      }
      // If no user is authenticated, createdBy will be undefined (optional field)

      rto = await RTO.create(rtoData);
      
      logme.info('Created new RTO', { subdomain, companyName: rto.companyName, rtoId: rto._id });
    }
    
    req.rtoContext = {
      rtoId: rto._id,
      subdomain: subdomain,
      rto: rto,
      isRTO: true
    };
    
    // Also set req.rtoId for backward compatibility
    req.rtoId = rto._id;
    req.rto = rto;
    
    next();
  } catch (error) {
    logme.error('Error in subdomain middleware', error);
    req.rtoContext = null;
    req.rtoId = null;
    req.rto = null;
    next();
  }
};

// Helper function to get RTO ID from request
const getRTOId = (req) => {
  return req.rtoContext?.rtoId || req.rtoId;
};

// Helper function to check if request is in RTO context
const isRTOContext = (req) => {
  return req.rtoContext?.isRTO || false;
};

module.exports = {
  getRTOFromSubdomain,
  getRTOId,
  isRTOContext
}; 