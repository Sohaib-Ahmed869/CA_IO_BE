// middleware/tenant.js
const RTO = require("../models/rto");

// Identify RTO from subdomain, fallback to global/default
const identifyRTO = async (req, res, next) => {
  try {
    const host = req.get('host') || req.get('x-forwarded-host') || '';
    const subdomain = host.split('.')[0];
    
    // First try to identify RTO from subdomain
    if (subdomain !== 'api' && subdomain !== 'www' && subdomain !== 'certified') {
      const rto = await RTO.findOne({ subdomain, isActive: true });
      if (rto) {
        req.rto = rto;
        req.rtoId = rto._id;
        return next();
      }
    }
    
    // Fallback: Check for rtoId in query parameters
    if (req.query.rtoId) {
      const rto = await RTO.findById(req.query.rtoId);
      if (rto && rto.isActive) {
        req.rto = rto;
        req.rtoId = rto._id;
        return next();
      }
    }
    
    next();
  } catch (error) {
    console.error("RTO identification error:", error);
    next();
  }
};

// Helper: backward-compatible RTO filter
const rtoFilter = (rtoId) => {
  if (!rtoId) return {};
  return { $or: [ { rtoId }, { rtoId: { $exists: false } } ] };
};

module.exports = { identifyRTO, rtoFilter }; 