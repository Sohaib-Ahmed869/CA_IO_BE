const RTO = require("../models/rto");
const { logMe } = require("../utils/logger");
const { deleteFileFromS3 } = require("../config/s3Config");
const smtpVerifier = require("../utils/smtpVerifier");

const rtoController = {
  // Get all RTOs (Admin only)
  getAllRTOs: async (req, res) => {
    try {
      const rtos = await RTO.getAllActive();
      
      // Remove sensitive information
      const sanitizedRTOs = rtos.map(rto => ({
        id: rto._id,
        name: rto.name,
        shortName: rto.shortName,
        rtoCode: rto.rtoCode,
        ceoName: rto.ceoName,
        primaryColor: rto.primaryColor,
        secondaryColor: rto.secondaryColor,
        logo: rto.logo,
        status: rto.status,
        isDefault: rto.isDefault,
        features: rto.features,
        contact: rto.contact,
        documents: rto.documents,
        timezone: rto.timezone,
        dateFormat: rto.dateFormat,
        currency: rto.currency,
        createdAt: rto.createdAt,
        updatedAt: rto.updatedAt
      }));
      
      res.json({
        success: true,
        data: sanitizedRTOs
      });
    } catch (error) {
      logMe("rto.get_all.error", error, "error");
      res.status(500).json({
        success: false,
        message: "Error fetching RTOs",
        error: error.message
      });
    }
  },

  // Get single RTO by code
  getRTOByCode: async (req, res) => {
    try {
      const { rtoCode } = req.params;
      
      // Use RTO context from middleware if available (for subdomain-based access)
      let rto = req.rtoConfig;
      
      // If no RTO context, try to find by RTO code
      if (!rto) {
        rto = await RTO.findByCode(rtoCode);
        
        // If not found, try to find by subdomain in contact.website
        if (!rto) {
          rto = await RTO.findOne({
            'contact.website': { $regex: `.*${rtoCode}.*`, $options: 'i' }
          });
        }
      }
      
      if (!rto) {
        return res.status(404).json({
          success: false,
          message: "RTO not found"
        });
      }

      // Get form templates and certifications for this RTO
      const FormTemplate = require("../models/formTemplate");
      const Certification = require("../models/certification");
      
      const [formTemplates, certifications] = await Promise.all([
        FormTemplate.find({ 
          rtoId: rto._id, 
          isActive: true 
        }).select('name description stepNumber filledBy templateType createdAt updatedAt'),
        
        Certification.find({ 
          rtoId: rto._id, 
          isActive: true 
        }).populate('formTemplateIds.formTemplateId', 'name stepNumber filledBy')
         .select('name price description formTemplateIds competencyUnits certificationType createdAt updatedAt')
      ]);
      
      // Remove sensitive information
      const sanitizedRTO = {
        id: rto._id,
        name: rto.name,
        shortName: rto.shortName,
        rtoCode: rto.rtoCode,
        ceoName: rto.ceoName,
        ceoEmail: rto.ceoEmail,
        primaryColor: rto.primaryColor,
        secondaryColor: rto.secondaryColor,
        logo: rto.logo,
        status: rto.status,
        isDefault: rto.isDefault,
        features: rto.features,
        contact: rto.contact,
        documents: rto.documents,
        timezone: rto.timezone,
        dateFormat: rto.dateFormat,
        currency: rto.currency,
        createdAt: rto.createdAt,
        updatedAt: rto.updatedAt,
        // Include form templates and certifications
        formTemplates: formTemplates,
        certifications: certifications
      };
      
      res.json({
        success: true,
        data: sanitizedRTO
      });
    } catch (error) {
      logMe("rto.get_by_code.error", error, "error");
      res.status(500).json({
        success: false,
        message: "Error fetching RTO",
        error: error.message
      });
    }
  },

  // Create new RTO (Certified Admin only)
  createRTO: async (req, res) => {
    try {
      const rtoData = req.body;
      
      // Validate required fields
      const requiredFields = ['name', 'shortName', 'rtoCode', 'ceoName'];
      for (const field of requiredFields) {
        if (!rtoData[field]) {
          return res.status(400).json({
            success: false,
            message: `${field} is required`
          });
        }
      }
      
      // Check if RTO code already exists
      const existingRTO = await RTO.findOne({ 
        $or: [
          { rtoCode: rtoData.rtoCode },
          { shortName: rtoData.shortName }
        ]
      });
      
      if (existingRTO) {
        return res.status(400).json({
          success: false,
          message: "RTO code or short name already exists"
        });
      }

      // Parse JSON string fields
      const jsonFields = ['contact', 'branding', 'features', 'emailConfig'];
      for (const field of jsonFields) {
        if (rtoData[field] && typeof rtoData[field] === 'string') {
          try {
            rtoData[field] = JSON.parse(rtoData[field]);
          } catch (error) {
            return res.status(400).json({
              success: false,
              message: `Invalid ${field} JSON format`,
              error: error.message
            });
          }
        }
      }

      // Parse and prepare email configuration
      let emailConfig = null;
      if (rtoData.emailConfig) {
        emailConfig = rtoData.emailConfig;
      } else if (rtoData.provider) {
        // Handle individual email fields (fallback for form data)
        emailConfig = {
          provider: rtoData.provider,
          host: rtoData.host,
          port: rtoData.port,
          secure: rtoData.secure === 'true' || rtoData.secure === true,
          username: rtoData.username,
          password: rtoData.password,
          fromEmail: rtoData.fromEmail,
          fromName: rtoData.fromName,
          replyTo: rtoData.replyTo
        };
      }

      // Verify SMTP configuration if provided
      if (emailConfig && rtoData.verifyEmailConfig !== false) {
        const smtpVerification = await smtpVerifier.verifySMTPConfig(emailConfig);
        if (!smtpVerification.success) {
          return res.status(400).json({
            success: false,
            message: "SMTP configuration is invalid",
            details: smtpVerification.details,
            smtpError: smtpVerification.message
          });
        }
      }

      // Set the parsed emailConfig back to rtoData
      if (emailConfig) {
        rtoData.emailConfig = emailConfig;
      }
      
      // Handle uploaded files (using existing S3 config)
      if (req.files) {
        console.log('📁 Files received:', Object.keys(req.files));
        console.log('📁 File details:', req.files);
        
        // Handle logo upload
        if (req.files.logo) {
          const logoFile = Array.isArray(req.files.logo) ? req.files.logo[0] : req.files.logo;
          rtoData.logo = {
            url: logoFile.location, // S3 URL from multer-s3
            alt: rtoData.logoAlt || `${rtoData.name} Logo`
          };
        }
        
        // Handle document uploads
        // Initialize documents object if not present
        if (!rtoData.documents) {
          rtoData.documents = {};
        } else if (typeof rtoData.documents === 'string') {
          // Parse if it's a JSON string
          try {
            rtoData.documents = JSON.parse(rtoData.documents);
          } catch (error) {
            console.log('Warning: Could not parse documents JSON, initializing empty object');
            rtoData.documents = {};
          }
        }
        
        // Process each document type from uploaded files
        const documentTypes = ['confirmationOfEnrolment', 'offerLetter', 'invoiceTemplate', 'termsAndConditions', 'privacyPolicy'];
        for (const docType of documentTypes) {
          if (req.files[docType]) {
            const docFile = Array.isArray(req.files[docType]) ? req.files[docType][0] : req.files[docType];
            console.log(`📄 Processing ${docType}:`, {
              filename: docFile.originalname,
              location: docFile.location,
              key: docFile.key,
              size: docFile.size,
              mimetype: docFile.mimetype
            });
            
            rtoData.documents[docType] = {
              template: docFile.location, // S3 URL from multer-s3
              required: rtoData.documents[docType]?.required || (docType === 'confirmationOfEnrolment' ? true : false)
            };
            console.log(`✅ Document uploaded: ${docType} -> ${docFile.location}`);
          } else {
            console.log(`❌ No file found for document type: ${docType}`);
          }
        }
      }
      
      // Set created by
      rtoData.createdBy = req.user.id;
      
      // Debug: Log final documents structure
      console.log('📋 Final documents structure:', JSON.stringify(rtoData.documents, null, 2));
      
      const rto = new RTO(rtoData);
      await rto.save();
      
      // RTO created successfully - no default forms/certifications created
      // Forms and certifications will be created during RTO setup process
      logMe("rto.created_successfully", {
        rtoId: rto._id,
        rtoCode: rto.rtoCode,
        name: rto.name
      });
      
      logMe("rto.created", {
        rtoId: rto._id,
        rtoCode: rto.rtoCode,
        createdBy: req.user.id,
        hasLogo: !!rto.logo?.url,
        documentCount: Object.keys(rto.documents || {}).length,
       // defaultsCreated: false // No default forms/certifications created during RTO creation
      });
      
      res.status(201).json({
        success: true,
        message: "RTO created successfully",
        data: {
          id: rto._id,
          name: rto.name,
          shortName: rto.shortName,
          rtoCode: rto.rtoCode,
          logo: rto.logo,
          documents: rto.documents,
        //  defaultsCreated: defaultsCreated
        }
      });
    } catch (error) {
      logMe("rto.create.error", error, "error");
      res.status(500).json({
        success: false,
        message: "Error creating RTO",
        error: error.message
      });
    }
  },

  // Update RTO (Certified Admin only)
  updateRTO: async (req, res) => {
    try {
      const { rtoCode } = req.params;
      const updateData = req.body;
      
      const rto = await RTO.findByCode(rtoCode);
      
      if (!rto) {
        return res.status(404).json({
          success: false,
          message: "RTO not found"
        });
      }

      // Parse JSON string fields
      const jsonFields = ['contact', 'branding', 'features', 'emailConfig'];
      for (const field of jsonFields) {
        if (updateData[field] && typeof updateData[field] === 'string') {
          try {
            updateData[field] = JSON.parse(updateData[field]);
          } catch (error) {
            return res.status(400).json({
              success: false,
              message: `Invalid ${field} JSON format`,
              error: error.message
            });
          }
        }
      }

      // Parse and prepare email configuration for update
      let emailConfig = null;
      if (updateData.emailConfig) {
        emailConfig = updateData.emailConfig;
      } else if (updateData.provider) {
        // Handle individual email fields (fallback for form data)
        emailConfig = {
          provider: updateData.provider,
          host: updateData.host,
          port: updateData.port,
          secure: updateData.secure === 'true' || updateData.secure === true,
          username: updateData.username,
          password: updateData.password,
          fromEmail: updateData.fromEmail,
          fromName: updateData.fromName,
          replyTo: updateData.replyTo
        };
      }

      // Verify SMTP configuration if provided and changed
      if (emailConfig && updateData.verifyEmailConfig !== false) {
        const smtpVerification = await smtpVerifier.verifySMTPConfig(emailConfig);
        if (!smtpVerification.success) {
          return res.status(400).json({
            success: false,
            message: "SMTP configuration is invalid",
            details: smtpVerification.details,
            smtpError: smtpVerification.message
          });
        }
      }

      // Set the parsed emailConfig back to updateData
      if (emailConfig) {
        updateData.emailConfig = emailConfig;
      }
      
      // Track files to delete if they're being replaced
      const filesToDelete = [];
      
      // Handle uploaded files (using existing S3 config)
      if (req.files) {
        // Handle logo upload/replacement
        if (req.files.logo) {
          // Mark old logo for deletion if it exists
          if (rto.logo?.url) {
            filesToDelete.push(rto.logo.url);
          }
          
          const logoFile = Array.isArray(req.files.logo) ? req.files.logo[0] : req.files.logo;
          updateData.logo = {
            url: logoFile.location, // S3 URL from multer-s3
            alt: updateData.logoAlt || rto.logo?.alt || `${rto.name} Logo`
          };
        }
        
        // Handle document uploads/replacements
        // Initialize documents object
        if (!updateData.documents) {
          updateData.documents = rto.documents || {};
        } else if (typeof updateData.documents === 'string') {
          // Parse if it's a JSON string
          try {
            updateData.documents = JSON.parse(updateData.documents);
          } catch (error) {
            console.log('Warning: Could not parse documents JSON, using existing documents');
            updateData.documents = rto.documents || {};
          }
        }
        
        // Process each document type from uploaded files
        const documentTypes = ['confirmationOfEnrolment', 'offerLetter', 'invoiceTemplate', 'termsAndConditions', 'privacyPolicy'];
        for (const docType of documentTypes) {
          if (req.files[docType]) {
            // Mark old document for deletion if it exists
            if (rto.documents?.[docType]?.template) {
              filesToDelete.push(rto.documents[docType].template);
            }
            
            const docFile = Array.isArray(req.files[docType]) ? req.files[docType][0] : req.files[docType];
            updateData.documents[docType] = {
              template: docFile.location, // S3 URL from multer-s3
              required: updateData.documents[docType]?.required || (docType === 'confirmationOfEnrolment' ? true : false)
            };
            console.log(`✅ Document updated: ${docType} -> ${docFile.location}`);
          }
        }
      }
      
      // Set updated by
      updateData.updatedBy = req.user.id;
      
      // Don't allow updating RTO code or short name
      delete updateData.rtoCode;
      delete updateData.shortName;
      
      const updatedRTO = await RTO.findByIdAndUpdate(
        rto._id,
        updateData,
        { new: true, runValidators: true }
      );
      
      // Delete old files after successful update
      if (filesToDelete.length > 0) {
        for (const fileUrl of filesToDelete) {
          // Extract S3 key from URL for deletion
          const s3Key = fileUrl.split('/').slice(3).join('/'); // Remove protocol and bucket name
          await deleteFileFromS3(s3Key);
        }
      }
      
      logMe("rto.updated", {
        rtoId: rto._id,
        rtoCode: rto.rtoCode,
        updatedBy: req.user.id,
        updatedFields: Object.keys(updateData),
        deletedFiles: filesToDelete.length
      });
      
      res.json({
        success: true,
        message: "RTO updated successfully",
        data: {
          id: updatedRTO._id,
          name: updatedRTO.name,
          shortName: updatedRTO.shortName,
          rtoCode: updatedRTO.rtoCode,
          logo: updatedRTO.logo,
          documents: updatedRTO.documents
        }
      });
    } catch (error) {
      logMe("rto.update.error", error, "error");
      res.status(500).json({
        success: false,
        message: "Error updating RTO",
        error: error.message
      });
    }
  },

  // Update RTO features (Certified Admin only)
  updateFeatures: async (req, res) => {
    try {
      const { rtoCode } = req.params;
      const { features } = req.body;
      
      if (!features || typeof features !== 'object') {
        return res.status(400).json({
          success: false,
          message: "Features object is required"
        });
      }
      
      const rto = await RTO.findByCode(rtoCode);
      
      if (!rto) {
        return res.status(404).json({
          success: false,
          message: "RTO not found"
        });
      }
      
      // Update only the provided features
      const currentFeatures = rto.features || {};
      const updatedFeatures = { ...currentFeatures, ...features };
      
      rto.features = updatedFeatures;
      rto.updatedBy = req.user.id;
      await rto.save();
      
      logMe("rto.features_updated", {
        rtoId: rto._id,
        rtoCode: rto.rtoCode,
        updatedBy: req.user.id,
        updatedFeatures: Object.keys(features)
      });
      
      res.json({
        success: true,
        message: "RTO features updated successfully",
        data: {
          id: rto._id,
          features: rto.features
        }
      });
    } catch (error) {
      logMe("rto.update_features.error", error, "error");
      res.status(500).json({
        success: false,
        message: "Error updating RTO features",
        error: error.message
      });
    }
  },

  // Set default RTO (Super Admin only)
  setDefaultRTO: async (req, res) => {
    try {
      const { rtoCode } = req.params;
      
      const rto = await RTO.findByCode(rtoCode);
      
      if (!rto) {
        return res.status(404).json({
          success: false,
          message: "RTO not found"
        });
      }
      
      // Remove default from all RTOs
      await RTO.updateMany({}, { isDefault: false });
      
      // Set this RTO as default
      rto.isDefault = true;
      rto.updatedBy = req.user.id;
      await rto.save();
      
      logMe("rto.set_default", {
        rtoId: rto._id,
        rtoCode: rto.rtoCode,
        updatedBy: req.user.id
      });
      
      res.json({
        success: true,
        message: "Default RTO set successfully",
        data: {
          id: rto._id,
          name: rto.name,
          rtoCode: rto.rtoCode
        }
      });
    } catch (error) {
      logMe("rto.set_default.error", error, "error");
      res.status(500).json({
        success: false,
        message: "Error setting default RTO",
        error: error.message
      });
    }
  },

  // Delete RTO (Super Admin and Certified Admin only) - Soft Delete
  deleteRTO: async (req, res) => {
    try {
      const { rtoCode } = req.params;
      
      const rto = await RTO.findByCode(rtoCode);
      
      if (!rto) {
        return res.status(404).json({
          success: false,
          message: "RTO not found"
        });
      }
      
      // Check if this is the default RTO
      if (rto.isDefault) {
        return res.status(400).json({
          success: false,
          message: "Cannot delete default RTO. Set another RTO as default first."
        });
      }
      
      // Check if RTO is already inactive
      if (rto.status !== "active") {
        return res.status(400).json({
          success: false,
          message: "RTO is already inactive"
        });
      }
      
      // Soft delete - set status to inactive instead of hard delete
      const updatedRTO = await RTO.findByIdAndUpdate(
        rto._id,
        { 
          status: "inactive",
          deactivatedAt: new Date(),
          deactivatedBy: req.user._id
        },
        { new: true }
      );
      
      logMe("rto.deactivated", {
        rtoId: rto._id,
        rtoCode: rto.rtoCode,
        rtoName: rto.name,
        deactivatedBy: req.user._id,
        deactivatedByType: req.user.userType,
        deactivatedAt: new Date()
      });
      
      res.json({
        success: true,
        message: "RTO deactivated successfully",
        data: {
          deactivatedRTO: {
            id: updatedRTO._id,
            name: updatedRTO.name,
            rtoCode: updatedRTO.rtoCode,
            status: updatedRTO.status,
            deactivatedAt: updatedRTO.deactivatedAt
          }
        }
      });
    } catch (error) {
      logMe("rto.delete.error", error, "error");
      res.status(500).json({
        success: false,
        message: "Error deactivating RTO",
        error: error.message
      });
    }
  },

  // Verify SMTP Configuration (Certified Admin only)
  verifySMTPConfig: async (req, res) => {
    try {
      const { emailConfig } = req.body;
      
      if (!emailConfig) {
        return res.status(400).json({
          success: false,
          message: "Email configuration is required"
        });
      }

      logMe("smtp.verification.start", {
        provider: emailConfig.provider,
        host: emailConfig.host,
        port: emailConfig.port,
        verifiedBy: req.user.id
      });

      // Verify SMTP configuration
      const verificationResult = await smtpVerifier.verifySMTPConfig(emailConfig);
      
      if (verificationResult.success) {
        logMe("smtp.verification.success", {
          provider: emailConfig.provider,
          host: emailConfig.host,
          verifiedBy: req.user.id
        });
      } else {
        logMe("smtp.verification.failed", {
          provider: emailConfig.provider,
          host: emailConfig.host,
          error: verificationResult.message,
          verifiedBy: req.user.id
        }, "warn");
      }

      res.json({
        success: verificationResult.success,
        message: verificationResult.message,
        data: verificationResult.details || {}
      });

    } catch (error) {
      logMe("smtp.verification.error", error, "error");
      res.status(500).json({
        success: false,
        message: "Error verifying SMTP configuration",
        error: error.message
      });
    }
  },

  // Quick SMTP verification (without sending test email)
  quickVerifySMTP: async (req, res) => {
    try {
      const { emailConfig } = req.body;
      
      if (!emailConfig) {
        return res.status(400).json({
          success: false,
          message: "Email configuration is required"
        });
      }

      // Quick verification
      const verificationResult = await smtpVerifier.quickVerify(emailConfig);
      
      res.json({
        success: verificationResult.success,
        message: verificationResult.message,
        data: verificationResult.details || {}
      });

    } catch (error) {
      logMe("smtp.quick_verification.error", error, "error");
      res.status(500).json({
        success: false,
        message: "Error verifying SMTP configuration",
        error: error.message
      });
    }
  },

  // Get RTO branding (Public endpoint)
  getBranding: async (req, res) => {
    try {
      const { rtoCode } = req.params;
      
      const rto = await RTO.findByCode(rtoCode);
      
      if (!rto) {
        return res.status(404).json({
          success: false,
          message: "RTO not found"
        });
      }
      
      res.json({
        success: true,
        data: {
          name: rto.name,
          shortName: rto.shortName,
          rtoCode: rto.rtoCode,
          logo: rto.logo,
          primaryColor: rto.primaryColor,
          secondaryColor: rto.secondaryColor,
          ceoName: rto.ceoName,
          contact: rto.contact
        }
      });
    } catch (error) {
      logMe("rto.get_branding.error", error, "error");
      res.status(500).json({
        success: false,
        message: "Error fetching RTO branding",
        error: error.message
      });
    }
  }
};

module.exports = rtoController;
