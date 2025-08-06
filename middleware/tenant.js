// middleware/tenant.js
const RTO = require("../models/rto");
const logme = require("../utils/logger");
const { shouldSkipSubdomain } = require("../config/constants");

// Identify RTO from subdomain, fallback to global/default
const identifyRTO = async (req, res, next) => {
  try {
    const host = req.get('host') || req.get('x-forwarded-host') || '';
    const subdomain = host.split('.')[0];
    
    // First try to identify RTO from subdomain
    if (!shouldSkipSubdomain(subdomain)) {
      const rto = await RTO.findOne({ subdomain, isActive: true });
      if (rto) {
        req.rto = rto;
        req.rtoId = rto._id.toString();
        logme.debug('RTO identified from subdomain', { companyName: rto.companyName, rtoId: rto._id.toString() });
        return next();
      }
    }
    
    // Fallback: Check for rtoId in query parameters
    if (req.query.rtoId) {
      const rto = await RTO.findById(req.query.rtoId);
      if (rto && rto.isActive) {
        req.rto = rto;
        req.rtoId = rto._id.toString();
        logme.debug('RTO identified from query parameter', { companyName: rto.companyName, rtoId: rto._id.toString() });
        return next();
      }
    }
    
    next();
  } catch (error) {
    logme.error("RTO identification error", error);
    next();
  }
};

// Helper: RTO-specific filter (only return RTO data, not legacy data)
const rtoFilter = (rtoId) => {
  if (!rtoId) {
    return {};
  }
  
  // Only return data for this specific RTO, exclude legacy data
  const filter = { rtoId: rtoId };
  logme.debug('RTO filter applied', { rtoId, filter });
  return filter;
};

// Helper: RTO filter that includes legacy data for admin operations
const rtoFilterWithLegacy = (rtoId) => {
  if (!rtoId) {
    return {};
  }
  
  // Include both RTO-specific data and legacy data (for admin operations)
  const filter = { 
    $or: [
      { rtoId: rtoId },
      { rtoId: { $exists: false } },
      { rtoId: null }
    ]
  };
  logme.debug('RTO filter with legacy applied', { rtoId, filter });
  return filter;
};

module.exports = { identifyRTO, rtoFilter, rtoFilterWithLegacy }; 