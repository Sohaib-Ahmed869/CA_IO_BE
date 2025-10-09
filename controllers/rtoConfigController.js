/**
 * RTO Configuration Controller
 * 
 * Provides RTO-specific configuration for frontend applications
 */

const { getRtoBranding, getRtoEmailConfig, getRtoContext, addRtoResponseHeaders } = require("../utils/rtoContextUtils");
const { logMe } = require("../utils/logger");

const rtoConfigController = {
  // Get complete RTO configuration for frontend
  getRtoConfig: async (req, res) => {
    try {
      const rtoContext = getRtoContext(req);
      
      // If no subdomain (admin access), return admin configuration
      if (rtoContext.isAdminAccess && !rtoContext.hasSubdomain) {
        const RTO = require("../models/rto");
        const allRTOs = await RTO.find({ isActive: true }).select('name rtoCode shortName logo primaryColor secondaryColor');
        
        const adminConfig = {
          isAdminAccess: true,
          userType: rtoContext.userType,
          availableRTOs: allRTOs,
          api: {
            baseUrl: process.env.API_BASE_URL || 'http://localhost:5000',
            endpoints: {
              auth: '/api/auth',
              rtos: '/api/rtos',
              applications: '/api/applications',
              certifications: '/api/certifications',
              formTemplates: '/api/form-templates',
              formSubmissions: '/api/form-submissions',
              payments: '/api/student-payments',
              documents: '/api/documents'
            }
          }
        };

        res.json({
          success: true,
          message: "Admin configuration retrieved successfully",
          data: adminConfig,
          rtoContext: rtoContext
        });
        return;
      }
      
      if (!req.rtoConfig) {
        return res.status(404).json({
          success: false,
          message: "RTO configuration not found"
        });
      }

      // Get RTO branding information
      const branding = getRtoBranding(req.rtoConfig);
      
      // Get form templates, certifications, and Stripe config for this RTO
      const FormTemplate = require("../models/formTemplate");
      const Certification = require("../models/certification");
      const StripeConfig = require("../models/stripeConfig");
      
      const [formTemplates, certifications, stripeConfig] = await Promise.all([
        FormTemplate.find({ 
          rtoId: req.rtoConfig._id, 
          isActive: true 
        }).select('name description stepNumber filledBy templateType'),
        
        Certification.find({ 
          rtoId: req.rtoConfig._id, 
          isActive: true 
        }).populate('formTemplateIds.formTemplateId', 'name stepNumber filledBy')
         .select('name price description formTemplateIds competencyUnits certificationType'),
         
        StripeConfig.findOne({ 
          rtoId: req.rtoConfig._id, 
          isActive: true 
        }).select('publishableKey paymentSettings capabilities accountStatus')
      ]);

      const config = {
        // RTO Identity
        rto: {
          id: req.rtoConfig._id,
          name: req.rtoConfig.name,
          shortName: req.rtoConfig.shortName,
          rtoCode: req.rtoConfig.rtoCode,
          subdomain: rtoContext.subdomain
        },
        
        // Branding & UI
        branding: {
          logo: req.rtoConfig.logo,
          primaryColor: req.rtoConfig.primaryColor,
          secondaryColor: req.rtoConfig.secondaryColor,
          name: req.rtoConfig.name,
          shortName: req.rtoConfig.shortName
        },
        
        // Contact Information
        contact: req.rtoConfig.contact,
        
        // Features & Permissions
        features: req.rtoConfig.features,
        
        // Localization
        localization: {
          timezone: req.rtoConfig.timezone,
          dateFormat: req.rtoConfig.dateFormat,
          currency: req.rtoConfig.currency
        },
        
        // Documents & Templates
        documents: req.rtoConfig.documents,
        
        // Available Forms & Certifications
        availableForms: formTemplates,
        availableCertifications: certifications,
        
        // Stripe Configuration (Public info only)
        stripe: stripeConfig ? {
          publishableKey: stripeConfig.publishableKey,
          paymentSettings: {
            currency: stripeConfig.paymentSettings?.currency || 'AUD',
            statementDescriptor: stripeConfig.paymentSettings?.statementDescriptor || 'CERTIFIED',
            statementDescriptorSuffix: stripeConfig.paymentSettings?.statementDescriptorSuffix
          },
          capabilities: {
            chargesEnabled: stripeConfig.capabilities?.chargesEnabled || false,
            payoutsEnabled: stripeConfig.capabilities?.payoutsEnabled || false
          },
          accountStatus: stripeConfig.accountStatus
        } : null,
        
        // API Configuration
        api: {
          baseUrl: process.env.API_BASE_URL || 'http://localhost:5000',
          endpoints: {
            auth: '/api/auth',
            applications: '/api/applications',
            certifications: '/api/certifications',
            formTemplates: '/api/form-templates',
            formSubmissions: '/api/form-submissions',
            payments: '/api/student-payments',
            documents: '/api/documents'
          }
        }
      };

      // Add RTO-specific response headers
      addRtoResponseHeaders(res, req.rtoConfig);

      logMe("rto.config.retrieved", {
        rtoCode: req.rtoConfig.rtoCode,
        subdomain: rtoContext.subdomain,
        formsCount: formTemplates.length,
        certificationsCount: certifications.length
      });

      res.json({
        success: true,
        message: "RTO configuration retrieved successfully",
        data: config,
        rtoContext: rtoContext
      });

    } catch (error) {
      logMe("rto.config.error", error, "error");
      res.status(500).json({
        success: false,
        message: "Error retrieving RTO configuration",
        error: error.message
      });
    }
  },

  // Get RTO branding only (for public pages)
  getRtoBranding: async (req, res) => {
    try {
      if (!req.rtoConfig) {
        return res.status(404).json({
          success: false,
          message: "RTO branding not found"
        });
      }

      const branding = getRtoBranding(req.rtoConfig);
      
      // Add RTO-specific response headers
      addRtoResponseHeaders(res, req.rtoConfig);

      res.json({
        success: true,
        message: "RTO branding retrieved successfully",
        data: branding
      });

    } catch (error) {
      logMe("rto.branding.error", error, "error");
      res.status(500).json({
        success: false,
        message: "Error retrieving RTO branding",
        error: error.message
      });
    }
  },

  // Get available forms for RTO
  getRtoForms: async (req, res) => {
    try {
      if (!req.rtoConfig) {
        return res.status(404).json({
          success: false,
          message: "RTO forms not found"
        });
      }

      const FormTemplate = require("../models/formTemplate");
      const formTemplates = await FormTemplate.find({ 
        rtoId: req.rtoConfig._id, 
        isActive: true 
      }).select('name description stepNumber filledBy templateType');

      res.json({
        success: true,
        message: "RTO forms retrieved successfully",
        data: formTemplates,
        rtoContext: getRtoContext(req)
      });

    } catch (error) {
      logMe("rto.forms.error", error, "error");
      res.status(500).json({
        success: false,
        message: "Error retrieving RTO forms",
        error: error.message
      });
    }
  },

  // Get available certifications for RTO
  getRtoCertifications: async (req, res) => {
    try {
      if (!req.rtoConfig) {
        return res.status(404).json({
          success: false,
          message: "RTO certifications not found"
        });
      }

      const Certification = require("../models/certification");
      const certifications = await Certification.find({ 
        rtoId: req.rtoConfig._id, 
        isActive: true 
      }).populate('formTemplateIds.formTemplateId', 'name stepNumber filledBy')
       .select('name price description formTemplateIds competencyUnits certificationType');

      res.json({
        success: true,
        message: "RTO certifications retrieved successfully",
        data: certifications,
        rtoContext: getRtoContext(req)
      });

    } catch (error) {
      logMe("rto.certifications.error", error, "error");
      res.status(500).json({
        success: false,
        message: "Error retrieving RTO certifications",
        error: error.message
      });
    }
  },

  // Get all RTOs (for admin access)
  getAllRTOs: async (req, res) => {
    try {
      const rtoContext = getRtoContext(req);
      
      // Only allow admin access (no subdomain)
      if (rtoContext.hasSubdomain) {
        return res.status(403).json({
          success: false,
          message: "Admin access required - this endpoint is only available on main domain"
        });
      }

      const RTO = require("../models/rto");
      const allRTOs = await RTO.find({ status: "active" })
        .select('name rtoCode shortName logo primaryColor secondaryColor status isDefault contact.features createdAt updatedAt')
        .sort({ createdAt: -1 });

      res.json({
        success: true,
        message: "All RTOs retrieved successfully",
        data: allRTOs,
        rtoContext: rtoContext
      });

    } catch (error) {
      logMe("rto.admin.get_all.error", error, "error");
      res.status(500).json({
        success: false,
        message: "Error retrieving all RTOs",
        error: error.message
      });
    }
  }
};

module.exports = rtoConfigController;
