// middleware/subdomainMiddleware.js
const RTO = require("../models/rto");
const User = require("../models/user");

const getRTOFromSubdomain = async (req, res, next) => {
  try {
    const hostname = req.hostname;
    const subdomain = hostname.split('.')[0];
    
    console.log('🔍 Subdomain detection:', { hostname, subdomain });
    
    // Skip for api, www, certified, localhost subdomains
    if (['api', 'www', 'certified', 'localhost'].includes(subdomain)) {
      console.log('⏭️ Skipping RTO detection for:', subdomain);
      req.rtoContext = null;
      return next();
    }
    
    // ANY other subdomain is treated as an RTO
    console.log('🏢 Looking for RTO with subdomain:', subdomain);
    
    // Try to find existing RTO by subdomain
    let rto = await RTO.findOne({ subdomain: subdomain, isActive: true });
    
    if (!rto) {
      console.log('🆕 RTO not found, creating new RTO for subdomain:', subdomain);
      
      // Create RTO automatically if it doesn't exist
      const companyName = subdomain
        .replace(/([A-Z])/g, ' $1') // Add space before capital letters
        .replace(/^./, str => str.toUpperCase()) // Capitalize first letter
        .replace(/-/g, ' ') // Replace hyphens with spaces
        .replace(/_/g, ' '); // Replace underscores with spaces
      
      rto = await RTO.create({
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
        createdBy: null, // Will be set by super admin later
        settings: {
          features: {
            assessors: true,
            salesAgents: false,
            certificates: true,
            formTemplates: true
          }
        }
      });
      
      console.log('✅ Created new RTO:', rto.companyName, 'with ID:', rto._id);
    } else {
      console.log('✅ Found existing RTO:', rto.companyName);
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
    
    console.log('🎯 RTO Context set:', {
      rtoId: rto._id,
      subdomain: subdomain,
      companyName: rto.companyName
    });
    
    next();
  } catch (error) {
    console.error('❌ Error in subdomain middleware:', error);
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