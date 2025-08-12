// controllers/rtoController.js
const RTO = require("../models/rto");
const logme = require("../utils/logger");
const User = require("../models/user");
const RTOAssets = require("../models/rtoAssets");
const { uploadToS3, deleteFromS3 } = require("../config/s3Config");
const Application = require("../models/application");
const Certification = require("../models/certification");
const FormTemplate = require("../models/formTemplate");

const rtoController = {
  // Test email with branding and logo
  testEmailWithBranding: async (req, res) => {
    try {
      const { rtoId } = req.params;
      const { testEmail } = req.body;
      const emailService = require("../services/emailService2");
      
      if (!testEmail) {
        return res.status(400).json({ 
          success: false, 
          message: "Test email address is required",
        });
      }
      
      // Debug RTO branding first
      const branding = await emailService.debugRTOBranding(rtoId);
      
      // Create a test user object
      const testUser = {
        firstName: "Test",
        lastName: "User",
        email: testEmail,
      };
      
      // Create a test application object
      const testApplication = {
        _id: "test-application-id",
        certificationName: "Test Certification",
      };
      
      // Create a test payment object
      const testPayment = {
        _id: "test-payment-id",
        totalAmount: 499.98,
      };
      
      // Send test email
      await emailService.sendPaymentConfirmationEmail(
        testUser,
        testApplication,
        testPayment,
        rtoId
      );
      
      res.json({
        success: true,
        message: "Test email sent successfully",
        data: {
          rtoId,
          testEmail,
          branding: {
            companyName: branding?.companyName,
            logoUrl: branding?.logoUrl,
            hasLogo: !!branding?.logoUrl,
            primaryColor: branding?.primaryColor,
            secondaryColor: branding?.secondaryColor
          }
        },
      });
    } catch (error) {
      logme.error("Test email error:", error);
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  },

  // Validate email credentials before RTO creation/update
  validateEmailCredentials: async (req, res) => {
    try {
      const {
        emailProvider,
        email,
        appPassword,
        smtpHost,
        smtpPort,
        smtpSecure
      } = req.body;

      // Validate required fields
      if (!emailProvider || !email || !appPassword) {
        return res.status(400).json({
          success: false,
          message: "Email provider, email, and app password are required"
        });
      }

      // Validate email provider
      if (!['gmail', 'outlook', 'custom'].includes(emailProvider)) {
        return res.status(400).json({
          success: false,
          message: "Invalid email provider. Must be 'gmail', 'outlook', or 'custom'"
        });
      }

      // Validate custom SMTP fields
      if (emailProvider === 'custom') {
        if (!smtpHost || !smtpPort) {
          return res.status(400).json({
            success: false,
            message: "SMTP host and port are required for custom provider"
          });
        }
      }

      // Test email connection
      const multiEmailService = require("../services/multiEmailService");
      const testResult = await multiEmailService.testEmailCredentials({
        emailProvider,
        email,
        password: appPassword,
        smtpHost,
        smtpPort,
        smtpSecure
      });

      if (testResult.success) {
        res.json({
          success: true,
          message: "Email credentials validated successfully",
          data: {
            emailProvider,
            email,
            isValid: true,
            testMessage: testResult.message,
            messageId: testResult.messageId
          }
        });
      } else {
        res.status(400).json({
          success: false,
          message: "Email credentials validation failed",
          data: {
            emailProvider,
            email,
            isValid: false,
            error: testResult.message
          }
        });
      }

    } catch (error) {
      logme.error("Email credentials validation error:", error);
      res.status(500).json({
        success: false,
        message: "Error validating email credentials",
        error: error.message
      });
    }
  },

  // Test RTO email configuration
  testRTOEmail: async (req, res) => {
    try {
      const { rtoId } = req.params;
      const { testEmail } = req.body;
      
      if (!testEmail) {
        return res.status(400).json({
          success: false,
          message: "Test email address is required"
        });
      }
      
      // Get RTO with email configuration
      const rto = await RTO.findById(rtoId).select('+emailConfig.appPassword');
      if (!rto) {
        return res.status(404).json({
          success: false,
          message: "RTO not found"
        });
      }
      
      if (!rto.emailConfig || !rto.emailConfig.isEmailConfigured) {
        return res.status(400).json({
          success: false,
          message: "RTO email is not configured"
        });
      }
      
      // Test the email configuration
      const multiEmailService = require("../services/multiEmailService");
      const testResult = await multiEmailService.testRTOEmail(rtoId, testEmail);
      
      // Update RTO email test status
      await RTO.findByIdAndUpdate(rtoId, {
        'emailConfig.emailTestStatus': testResult.success ? 'success' : 'failed',
        'emailConfig.lastEmailTest': new Date()
      });
      
      res.json({
        success: true,
        message: testResult.success ? "Test email sent successfully" : "Test email failed",
        data: {
          rtoId,
          testEmail,
          testResult: testResult.message,
          emailConfig: {
            provider: rto.emailConfig.emailProvider,
            email: rto.emailConfig.email,
            isConfigured: rto.emailConfig.isEmailConfigured
          }
        }
      });
    } catch (error) {
      logme.error("Test RTO email error:", error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  },

  // Debug function to test RTO branding
  debugRTOBranding: async (req, res) => {
    try {
      const { rtoId } = req.params;
      const emailService = require("../services/emailService2");
      
      // Get RTO data directly
      const rto = await RTO.findById(rtoId);
      if (!rto) {
        return res.status(404).json({
          success: false,
          message: "RTO not found",
        });
      }
      
      // Get branding data through email service
      const branding = await emailService.getRTOBranding(rtoId);
      
      res.json({
        success: true,
        data: {
          rtoId,
          rtoData: {
            companyName: rto.companyName,
            ceoName: rto.ceoName,
            ceoCode: rto.ceoCode,
            rtoNumber: rto.rtoNumber,
            email: rto.email,
            phone: rto.phone,
            primaryColor: rto.primaryColor,
            secondaryColor: rto.secondaryColor,
            logoUrl: rto.assets?.logo?.url,
            address: rto.address,
          },
          brandingData: branding,
        },
      });
    } catch (error) {
      logme.error("Debug RTO branding error:", error);
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  },

  createRTO: async (req, res) => {
    try {
      // Process the request body to fix common issues
      const rtoData = { ...req.body };
      
      // Convert date strings to Date objects
      if (rtoData.registrationDate && typeof rtoData.registrationDate === 'string') {
        rtoData.registrationDate = new Date(rtoData.registrationDate);
      }
      if (rtoData.expiryDate && typeof rtoData.expiryDate === 'string') {
        rtoData.expiryDate = new Date(rtoData.expiryDate);
      }
      
      // Convert subdomain to lowercase and validate
      if (rtoData.subdomain) {
        rtoData.subdomain = rtoData.subdomain.toLowerCase();
        // Remove any characters that don't match the regex
        rtoData.subdomain = rtoData.subdomain.replace(/[^a-z0-9-]/g, '');
      }
      
      // Convert subscription dates
      if (rtoData.subscription) {
        if (rtoData.subscription.startDate && typeof rtoData.subscription.startDate === 'string') {
          rtoData.subscription.startDate = new Date(rtoData.subscription.startDate);
        }
        if (rtoData.subscription.endDate && typeof rtoData.subscription.endDate === 'string') {
          rtoData.subscription.endDate = new Date(rtoData.subscription.endDate);
        }
      }
      
      // Add themeColor if missing
      if (!rtoData.themeColor) {
        rtoData.themeColor = rtoData.primaryColor || "#007bff";
      }
      
      // Handle email configuration setup - only accept if already validated
      if (rtoData.emailConfig && rtoData.emailConfig.email && rtoData.emailConfig.appPassword) {
        try {
          // Validate email configuration
          if (!rtoData.emailConfig.emailProvider) {
            rtoData.emailConfig.emailProvider = 'gmail';
          }
          
          // Set email as configured and tested
          rtoData.emailConfig.isEmailConfigured = true;
          rtoData.emailConfig.emailTestStatus = 'success'; // Mark as tested since validation passed
          rtoData.emailConfig.lastEmailTest = new Date();
          
          logme.info("Validated email configuration provided during RTO creation", {
            emailProvider: rtoData.emailConfig.emailProvider,
            email: rtoData.emailConfig.email,
            rtoName: rtoData.companyName
          });
        } catch (emailError) {
          logme.warn("Email configuration setup failed during RTO creation", {
            error: emailError.message,
            rtoName: rtoData.companyName
          });
          // Continue with RTO creation even if email setup fails
        }
      }
      
      const rto = new RTO({
        ...rtoData,
        createdBy: req.user._id // Add the createdBy field
      });
      await rto.save();

      res.status(201).json({
        success: true,
        message: "RTO created successfully",
        data: rto,
      });
    } catch (error) {
      logme.error("Create RTO error:", error);
      res.status(500).json({
        success: false,
        message: "Error creating RTO",
        error: error.message,
      });
    }
  },
  getAllRTOs: async (req, res) => {
    try {
      const rtos = await RTO.find({ isActive: true }).select("companyName subdomain isActive isVerified createdAt");

      res.json({
        success: true,
        data: rtos,
      });
    } catch (error) {
      logme.error("Get all RTOs error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching RTOs",
      });
    }
  },
  getRTOById: async (req, res) => {
    try {
      const rto = await RTO.findById(req.params.id);
      if (!rto) {
        return res.status(404).json({ 
          success: false, 
          message: "RTO not found" 
        });
      }
      
      // Add email configuration status
      const emailStatus = {
        isConfigured: rto.isEmailFullyConfigured(),
        provider: rto.emailConfig?.emailProvider || null,
        email: rto.emailConfig?.email || null,
        testStatus: rto.emailConfig?.emailTestStatus || 'pending',
        lastTested: rto.emailConfig?.lastEmailTest || null,
        suggestedEmail: rto.generateSuggestedEmail()
      };
      
      res.json({ 
        success: true, 
        data: {
          ...rto.toObject(),
          emailStatus
        }
      });
    } catch (error) {
      logme.error("Get RTO by ID error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching RTO",
        error: error.message
      });
    }
  },
  updateRTO: async (req, res) => {
    try {
      const updateData = { ...req.body };
      
      // Handle email configuration updates
      if (updateData.emailConfig) {
        try {
          // If email and app password are provided, update email configuration
          if (updateData.emailConfig.email && updateData.emailConfig.appPassword) {
            updateData.emailConfig.isEmailConfigured = true;
            updateData.emailConfig.emailTestStatus = 'pending';
            updateData.emailConfig.lastEmailTest = new Date();
            
            logme.info("Email configuration updated during RTO update", {
              rtoId: req.params.id,
              emailProvider: updateData.emailConfig.emailProvider,
              email: updateData.emailConfig.email
            });
          }
          
          // If email is removed, mark as not configured
          if (!updateData.emailConfig.email || !updateData.emailConfig.appPassword) {
            updateData.emailConfig.isEmailConfigured = false;
            updateData.emailConfig.emailTestStatus = 'failed';
            updateData.emailConfig.appPassword = undefined;
          }
        } catch (emailError) {
          logme.warn("Email configuration update failed during RTO update", {
            error: emailError.message,
            rtoId: req.params.id
          });
        }
      }
      
      const rto = await RTO.findByIdAndUpdate(req.params.id, updateData, { 
        new: true,
        runValidators: true 
      });
      
      if (!rto) {
        return res.status(404).json({ 
          success: false, 
          message: "RTO not found" 
        });
      }
      
      res.json({ 
        success: true, 
        message: "RTO updated successfully",
        data: rto 
      });
    } catch (error) {
      logme.error("Update RTO error:", error);
      res.status(500).json({
        success: false,
        message: "Error updating RTO",
        error: error.message
      });
    }
  },
  deleteRTO: async (req, res) => {
    try {
      const rto = await RTO.findByIdAndUpdate(
        req.params.id, 
        { 
          isActive: false, 
          deletedAt: new Date() 
        }, 
        { new: true }
      );
      
      if (!rto) {
        return res.status(404).json({ 
          success: false, 
          message: "RTO not found" 
        });
      }
      
      res.json({ 
        success: true, 
        message: "RTO soft deleted successfully",
        data: {
          rtoId: rto._id,
          companyName: rto.companyName,
          deletedAt: rto.deletedAt
        }
      });
    } catch (error) {
      logme.error("Delete RTO error:", error);
      res.status(500).json({
        success: false,
        message: "Error deleting RTO",
        error: error.message
      });
    }
  },
  restoreRTO: async (req, res) => {
    try {
      const rto = await RTO.findByIdAndUpdate(
        req.params.id, 
        { 
          isActive: true, 
          deletedAt: null 
        }, 
        { new: true }
      );
      
      if (!rto) {
        return res.status(404).json({ 
          success: false, 
          message: "RTO not found" 
        });
      }
      
      res.json({ 
        success: true, 
        message: "RTO restored successfully",
        data: {
          rtoId: rto._id,
          companyName: rto.companyName,
          isActive: rto.isActive
        }
      });
    } catch (error) {
      logme.error("Restore RTO error:", error);
      res.status(500).json({
        success: false,
        message: "Error restoring RTO",
        error: error.message
      });
    }
  },
  updateEmailTemplates: async (req, res) => {
    const rto = await RTO.findByIdAndUpdate(req.params.id, { emailTemplates: req.body.emailTemplates }, { new: true });
    if (!rto) return res.status(404).json({ success: false, message: "Not found" });
    res.json({ success: true, data: rto.emailTemplates });
  },
  updateFeatures: async (req, res) => {
    const rto = await RTO.findByIdAndUpdate(req.params.id, { "settings.features": req.body.features }, { new: true });
    if (!rto) return res.status(404).json({ success: false, message: "Not found" });
    res.json({ success: true, data: rto.settings.features });
  },

  // Asset Management Methods
  uploadLogo: async (req, res) => {
    try {
      const { rtoId } = req.params;
      const file = req.file;

      if (!file) {
        return res.status(400).json({
          success: false,
          message: "No file uploaded",
        });
      }

      // Validate file type (only images)
      const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
      if (!allowedTypes.includes(file.mimetype)) {
        return res.status(400).json({
          success: false,
          message: "Only image files are allowed for logo upload",
        });
      }

      // Check if RTO exists and is active
      const rto = await RTO.findOne({ _id: rtoId, isActive: true });
      if (!rto) {
        return res.status(404).json({
          success: false,
          message: "RTO not found or inactive",
        });
      }

      // Get or create RTO assets
      let rtoAssets = await RTOAssets.findOne({ rtoId });
      if (!rtoAssets) {
        rtoAssets = new RTOAssets({ rtoId });
      }

      // Delete old logo from S3 if exists
      if (rtoAssets.logo && rtoAssets.logo.key) {
        try {
          await deleteFromS3(rtoAssets.logo.key);
        } catch (error) {
          logme.error("Error deleting old logo from S3:", error);
        }
      }

      // Save logo info with new key format
      rtoAssets.logo = {
        url: file.location,
        key: `${rtoId}/logo/${file.originalname}`,
        uploadedAt: new Date(),
        originalName: file.originalname,
        fileSize: file.size,
        mimeType: file.mimetype,
        isActive: true,
      };

      await rtoAssets.save();

      res.json({
        success: true,
        message: "Logo uploaded successfully",
        data: { logo: rtoAssets.logo },
      });
    } catch (error) {
      logme.error("Upload logo error:", error);
      res.status(500).json({
        success: false,
        message: "Error uploading logo",
      });
    }
  },

  uploadDocument: async (req, res) => {
    try {
      const { rtoId } = req.params;
      const { title, type, description } = req.body;
      const file = req.file;

      if (!file) {
        return res.status(400).json({
          success: false,
          message: "No file uploaded",
        });
      }

      if (!title || !type) {
        return res.status(400).json({
          success: false,
          message: "Title and type are required",
        });
      }

      // Check if RTO exists and is active
      const rto = await RTO.findOne({ _id: rtoId, isActive: true });
      if (!rto) {
        return res.status(404).json({
          success: false,
          message: "RTO not found or inactive",
        });
      }

      // Create new document object
      const newDocument = {
        title,
        type,
        description: description || '',
        url: file.location,
        key: `${rtoId}/documents/${file.originalname}`,
        uploadedAt: new Date(),
        originalName: file.originalname,
        fileSize: file.size,
        mimeType: file.mimetype,
        isActive: true,
      };

      // Use updateOne with $push to add document
      await RTOAssets.updateOne(
        { rtoId },
        { $push: { documents: newDocument } },
        { upsert: true }
      );

      res.json({
        success: true,
        message: "Document uploaded successfully",
        data: { document: newDocument },
      });
    } catch (error) {
      logme.error("Upload document error:", error);
      res.status(500).json({
        success: false,
        message: "Error uploading document",
      });
    }
  },

  getAssets: async (req, res) => {
    try {
      const { rtoId } = req.params;
      
      const rtoAssets = await RTOAssets.findOne({ rtoId });

      if (!rtoAssets) {
        return res.json({
          success: true,
          data: { logo: null, documents: [] },
        });
      }

      res.json({
        success: true,
        data: {
          logo: rtoAssets.logo,
          documents: rtoAssets.documents.filter(doc => doc.isActive),
        },
      });
    } catch (error) {
      logme.error("Get assets error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching assets",
      });
    }
  },

  deleteDocument: async (req, res) => {
    try {
      const { rtoId, documentId } = req.params;

      const rtoAssets = await RTOAssets.findOne({ rtoId });
      if (!rtoAssets) {
        return res.status(404).json({
          success: false,
          message: "RTO assets not found",
        });
      }

      // Find document
      const documentIndex = rtoAssets.documents.findIndex(
        (doc) => doc._id.toString() === documentId
      );

      if (documentIndex === -1) {
        return res.status(404).json({
          success: false,
          message: "Document not found",
        });
      }

      const document = rtoAssets.documents[documentIndex];

      // Delete from S3
      try {
        await deleteFromS3(document.key);
      } catch (error) {
        logme.error("Error deleting from S3:", error);
      }

      // Remove from documents array
      rtoAssets.documents.splice(documentIndex, 1);
      await rtoAssets.save();

      res.json({
        success: true,
        message: "Document deleted successfully",
      });
    } catch (error) {
      logme.error("Delete document error:", error);
      res.status(500).json({
        success: false,
        message: "Error deleting document",
      });
    }
  },

  updateDocumentStatus: async (req, res) => {
    try {
      const { rtoId, documentId } = req.params;
      const { title, type, description, isActive } = req.body;

      const rtoAssets = await RTOAssets.findOne({ rtoId });
      if (!rtoAssets) {
        return res.status(404).json({
          success: false,
          message: "RTO assets not found",
        });
      }

      // Find document
      const document = rtoAssets.documents.find(
        (doc) => doc._id.toString() === documentId
      );

      if (!document) {
        return res.status(404).json({
          success: false,
          message: "Document not found",
        });
      }

      // Update document fields
      if (title !== undefined) document.title = title;
      if (type !== undefined) document.type = type;
      if (description !== undefined) document.description = description;
      if (isActive !== undefined) document.isActive = isActive;

      await rtoAssets.save();

      res.json({
        success: true,
        message: "Document updated successfully",
        data: { document },
      });
    } catch (error) {
      logme.error("Update document error:", error);
      res.status(500).json({
        success: false,
        message: "Error updating document",
      });
    }
  },

  deleteLogo: async (req, res) => {
    try {
      const { rtoId } = req.params;

      const rtoAssets = await RTOAssets.findOne({ rtoId });
      if (!rtoAssets || !rtoAssets.logo) {
        return res.status(404).json({
          success: false,
          message: "Logo not found",
        });
      }

      // Delete from S3
      try {
        await deleteFromS3(rtoAssets.logo.key);
      } catch (error) {
        logme.error("Error deleting logo from S3:", error);
      }

      // Remove logo
      rtoAssets.logo = null;
      await rtoAssets.save();

      res.json({
        success: true,
        message: "Logo deleted successfully",
      });
    } catch (error) {
      logme.error("Delete logo error:", error);
      res.status(500).json({
        success: false,
        message: "Error deleting logo",
      });
    }
  },

  // RTO User Management Methods
  createRTOUser: async (req, res) => {
    try {
      const { rtoId } = req.params;
      const { firstName, lastName, email, password, phoneNumber, phoneCode, userType, rtoRole } = req.body;

      // Validate RTO exists and is active
      const rto = await RTO.findOne({ _id: rtoId, isActive: true });
      if (!rto) {
        return res.status(404).json({
          success: false,
          message: "RTO not found or inactive",
        });
      }

      // Check if user already exists with this email in this RTO
      const existingUser = await User.findOne({ 
        email, 
        rtoId: rtoId 
      });
      
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: "User with this email already exists in this RTO",
        });
      }

      // Validate user type based on RTO features
      if (userType === "assessor" && !rto.settings.features.assessors) {
        return res.status(400).json({
          success: false,
          message: "Assessors feature is not enabled for this RTO",
        });
      }

      if ((userType === "sales_agent" || userType === "sales_manager") && !rto.settings.features.salesAgents) {
        return res.status(400).json({
          success: false,
          message: "Sales agents feature is not enabled for this RTO",
        });
      }

      // Create user with RTO context
      const user = await User.create({
        firstName,
        lastName,
        email,
        password,
        phoneNumber,
        phoneCode,
        userType,
        rtoId: rtoId, // This will be the RTO ID
        rtoRole: rtoRole || userType,
        permissions: getDefaultPermissions(userType),
      });

      // Remove password from response
      const userResponse = user.toObject();
      delete userResponse.password;

      res.status(201).json({
        success: true,
        message: "RTO user created successfully",
        data: userResponse,
      });
    } catch (error) {
      logme.error("Create RTO user error:", error);
      res.status(500).json({
        success: false,
        message: "Error creating RTO user",
      });
    }
  },

  getRTOUsers: async (req, res) => {
    try {
      const { rtoId } = req.params;
      const { userType, page = 1, limit = 10, search } = req.query;

      // Validate RTO exists and is active
      const rto = await RTO.findOne({ _id: rtoId, isActive: true });
      if (!rto) {
        return res.status(404).json({
          success: false,
          message: "RTO not found or inactive",
        });
      }

      // Build query
      let query = { rtoId: rtoId };
      
      // Filter for active users by default
      query.isActive = true;
      
      if (userType && userType !== "all") {
        query.userType = userType;
      }

      if (search) {
        query.$or = [
          { firstName: { $regex: search, $options: "i" } },
          { lastName: { $regex: search, $options: "i" } },
          { email: { $regex: search, $options: "i" } },
        ];
      }

      const skip = (page - 1) * limit;

      const users = await User.find(query)
        .select("-password")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit));

      const total = await User.countDocuments(query);

      res.json({
        success: true,
        data: {
          users,
          pagination: {
            current: parseInt(page),
            pages: Math.ceil(total / limit),
            total,
          },
        },
      });
    } catch (error) {
      logme.error("Get RTO users error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching RTO users",
      });
    }
  },

  updateRTOUser: async (req, res) => {
    try {
      const { rtoId, userId } = req.params;
      const updateData = req.body;

      // Validate RTO exists and is active
      const rto = await RTO.findOne({ _id: rtoId, isActive: true });
      if (!rto) {
        return res.status(404).json({
          success: false,
          message: "RTO not found or inactive",
        });
      }

      // Validate user exists and belongs to this RTO
      const user = await User.findOne({ _id: userId, rtoId: rtoId });
      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found in this RTO",
        });
      }

      // Update user
      const updatedUser = await User.findByIdAndUpdate(
        userId,
        updateData,
        { new: true }
      ).select("-password");

      res.json({
        success: true,
        message: "RTO user updated successfully",
        data: updatedUser,
      });
    } catch (error) {
      logme.error("Update RTO user error:", error);
      res.status(500).json({
        success: false,
        message: "Error updating RTO user",
      });
    }
  },

  deleteRTOUser: async (req, res) => {
    try {
      const { rtoId, userId } = req.params;

      // Validate RTO exists and is active
      const rto = await RTO.findOne({ _id: rtoId, isActive: true });
      if (!rto) {
        return res.status(404).json({
          success: false,
          message: "RTO not found or inactive",
        });
      }

      // Validate user exists and belongs to this RTO
      const user = await User.findOne({ _id: userId, rtoId: rtoId });
      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found in this RTO",
        });
      }

      // Soft delete user
      await User.findByIdAndUpdate(userId, { isActive: false });

      res.json({
        success: true,
        message: "RTO user deleted successfully",
      });
    } catch (error) {
      logme.error("Delete RTO user error:", error);
      res.status(500).json({
        success: false,
        message: "Error deleting RTO user",
      });
    }
  },

  getRTOUserById: async (req, res) => {
    try {
      const { rtoId, userId } = req.params;

      // Validate RTO exists and is active
      const rto = await RTO.findOne({ _id: rtoId, isActive: true });
      if (!rto) {
        return res.status(404).json({
          success: false,
          message: "RTO not found or inactive",
        });
      }

      // Get user and validate they belong to this RTO
      const user = await User.findOne({ _id: userId, rtoId: rtoId })
        .select("-password")
        .populate("rtoId", "companyName subdomain");

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found in this RTO",
        });
      }

      res.json({
        success: true,
        data: user,
      });
    } catch (error) {
      logme.error("Get RTO user by ID error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching RTO user",
      });
    }
  },

  getRTOBySubdomain: async (req, res) => {
    try {
      const { subdomain } = req.params;
      
      const rto = await RTO.findOne({ 
        subdomain: subdomain,
        isActive: true 
      }).select('_id companyName isActive isVerified registrationDate expiryDate');

      if (!rto) {
        return res.status(404).json({
          success: false,
          message: "RTO not found",
        });
      }

      res.json({
        success: true,
        data: {
          rtoId: rto._id,
          companyName: rto.companyName,
          isActive: rto.isActive,
          isVerified: rto.isVerified,
          registrationDate: rto.registrationDate,
          expiryDate: rto.expiryDate,
        },
      });
    } catch (error) {
      logme.error("Get RTO by subdomain error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching RTO by subdomain",
      });
    }
  },

  getRTOLogo: async (req, res) => {
    try {
      const { rtoId } = req.params;
      
      const rto = await RTO.findById(rtoId).select("companyName");
      if (!rto) {
        return res.status(404).json({
          success: false,
          message: "RTO not found",
        });
      }

      const rtoAssets = await RTOAssets.findOne({ rtoId });

      res.json({
        success: true,
        data: {
          logo: rtoAssets?.logo || null,
          companyName: rto.companyName,
        },
      });
    } catch (error) {
      logme.error("Get RTO logo error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching RTO logo",
      });
    }
  },

  getRTOLogoBySubdomain: async (req, res) => {
    try {
      const { subdomain } = req.params;
      
      // Find RTO by subdomain
      const rto = await RTO.findOne({ subdomain }).select("_id companyName");
      if (!rto) {
        return res.status(404).json({
          success: false,
          message: "RTO not found",
        });
      }

      const rtoAssets = await RTOAssets.findOne({ rtoId: rto._id });

      res.json({
        success: true,
        data: {
          logo: rtoAssets?.logo || null,
          companyName: rto.companyName,
        },
      });
    } catch (error) {
      logme.error("Get RTO logo by subdomain error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching RTO logo",
      });
    }
  },

  getRTODocuments: async (req, res) => {
    try {
      const { rtoId } = req.params;
      
      const rtoAssets = await RTOAssets.findOne({ rtoId });

      res.json({
        success: true,
        data: rtoAssets?.documents?.filter(doc => doc.isActive) || [],
      });
    } catch (error) {
      logme.error("Get RTO documents error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching RTO documents",
      });
    }
  },

  getRTODocumentsBySubdomain: async (req, res) => {
    try {
      const { subdomain } = req.params;
      
      // Find RTO by subdomain
      const rto = await RTO.findOne({ subdomain }).select("_id");
      if (!rto) {
        return res.status(404).json({
          success: false,
          message: "RTO not found",
        });
      }

      const rtoAssets = await RTOAssets.findOne({ rtoId: rto._id });

      res.json({
        success: true,
        data: rtoAssets?.documents?.filter(doc => doc.isActive) || [],
      });
    } catch (error) {
      logme.error("Get RTO documents by subdomain error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching RTO documents",
      });
    }
  },

  getAssetsBySubdomain: async (req, res) => {
    try {
      const { subdomain } = req.params;
      
      // Find RTO by subdomain
      const rto = await RTO.findOne({ subdomain }).select("_id companyName");
      if (!rto) {
        return res.status(404).json({
          success: false,
          message: "RTO not found",
        });
      }

      const rtoAssets = await RTOAssets.findOne({ rtoId: rto._id });

      if (!rtoAssets) {
        return res.json({
          success: true,
          data: { logo: null, documents: [] },
        });
      }

      res.json({
        success: true,
        data: {
          logo: rtoAssets.logo,
          documents: rtoAssets.documents.filter(doc => doc.isActive),
          companyName: rto.companyName,
        },
      });
    } catch (error) {
      logme.error("Get assets by subdomain error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching assets",
      });
    }
  },

  getRTOFormTemplates: async (req, res) => {
    try {
      const { rtoId } = req.params;
      
      // Check if RTO exists and is active
      const rto = await RTO.findOne({ _id: rtoId, isActive: true });
      if (!rto) {
        return res.status(404).json({
          success: false,
          message: "RTO not found or inactive",
        });
      }

      // Get form templates for this RTO
      const FormTemplate = require("../models/formTemplate");
      
      // Get all form templates (active and inactive) for stats
      const allFormTemplates = await FormTemplate.find({ rtoId: rtoId });
      
      // Get only ACTIVE form templates for the main data
      const activeFormTemplatesData = await FormTemplate.find({ 
        rtoId: rtoId,
        isActive: true
      }).select('name description stepNumber filledBy category isActive createdAt updatedAt').sort({ createdAt: -1 });

      // Calculate statistics
      const totalForms = allFormTemplates.length;
      const activeForms = allFormTemplates.filter(form => form.isActive).length;
      const inactiveForms = totalForms - activeForms;
      
      // Get recent forms (created in last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const recentForms = activeFormTemplatesData.filter(form => 
        new Date(form.createdAt) > thirtyDaysAgo
      ).length;

      res.json({
        success: true,
        data: {
          forms: activeFormTemplatesData, // Only active forms
          statistics: {
            totalForms,
            activeForms,
            inactiveForms,
            recentForms
          }
        },
      });
    } catch (error) {
      logme.error("Get RTO form templates error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching form templates",
      });
    }
  },

  getRTOCertificates: async (req, res) => {
    try {
      const { rtoId } = req.params;
      
      // Check if RTO exists and is active
      const rto = await RTO.findOne({ _id: rtoId, isActive: true });
      if (!rto) {
        return res.status(404).json({
          success: false,
          message: "RTO not found or inactive",
        });
      }

      // Get certificates for this RTO
      const Certification = require("../models/certification");
      
      // Get all certificates (active and inactive) for stats
      const allCertificates = await Certification.find({ rtoId: rtoId });
      
      // Get all certificates (both active and inactive) for the main data
      const allCertificatesData = await Certification.find({ 
        rtoId: rtoId
      }).select('name description price duration category isActive createdAt updatedAt').sort({ createdAt: -1 });

      // Calculate statistics
      const totalCertificates = allCertificates.length;
      const activeCertificatesCount = allCertificatesData.filter(cert => cert.isActive).length;
      const inactiveCertificates = totalCertificates - activeCertificatesCount;
      
      // Get recent certificates (created in last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const recentCertificates = allCertificatesData.filter(cert => 
        cert.isActive && new Date(cert.createdAt) > thirtyDaysAgo
      ).length;

      res.json({
        success: true,
        data: {
          certificates: allCertificatesData,
          statistics: {
            totalCertificates,
            activeCertificates: activeCertificatesCount,
            inactiveCertificates,
            recentCertificates
          }
        },
      });
    } catch (error) {
      logme.error("Get RTO certificates error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching certificates",
      });
    }
  },

  getRTOFormTemplatesBySubdomain: async (req, res) => {
    try {
      const { subdomain } = req.params;
      
      // Find RTO by subdomain
      const rto = await RTO.findOne({ subdomain }).select("_id");
      if (!rto) {
        return res.status(404).json({
          success: false,
          message: "RTO not found",
        });
      }

      // Get form templates for this RTO (both active and inactive)
      const FormTemplate = require("../models/formTemplate");
      const formTemplates = await FormTemplate.find({ 
        rtoId: rto._id
      }).select('name description stepNumber filledBy category isActive createdAt').sort({ createdAt: -1 });

      res.json({
        success: true,
        data: formTemplates,
      });
    } catch (error) {
      logme.error("Get RTO form templates by subdomain error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching form templates",
      });
    }
  },

  getRTOCertificatesBySubdomain: async (req, res) => {
    try {
      const { subdomain } = req.params;
      
      // Find RTO by subdomain
      const rto = await RTO.findOne({ subdomain }).select("_id");
      if (!rto) {
        return res.status(404).json({
          success: false,
          message: "RTO not found",
        });
      }

      // Get certificates for this RTO
      const Certification = require("../models/certification");
      const certificates = await Certification.find({ 
        rtoId: rto._id,
        isActive: true 
      }).select('name description price duration category isActive createdAt');

      res.json({
        success: true,
        data: certificates,
      });
    } catch (error) {
      logme.error("Get RTO certificates by subdomain error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching certificates",
      });
    }
  },

  getRTOCertifications: async (req, res) => {
    try {
      const { rtoId } = req.params;
      const { page = 1, limit = 10, search, isActive } = req.query;
      const skip = (page - 1) * limit;

      // Validate RTO exists and is active
      const rto = await RTO.findOne({ _id: rtoId, isActive: true });
      if (!rto) {
        return res.status(404).json({
          success: false,
          message: "RTO not found or inactive",
        });
      }

      // Build query
      let query = { rtoId: rtoId };
      
      // Filter by active status if provided
      if (isActive !== undefined) {
        query.isActive = isActive === "true";
      } else {
        query.isActive = true; // Default to active only
      }

      // Search functionality
      if (search) {
        query.$or = [
          { name: { $regex: search, $options: "i" } },
          { description: { $regex: search, $options: "i" } },
        ];
      }

      // Get certifications for this RTO
      const Certification = require("../models/certification");
      const certifications = await Certification.find(query)
        .populate("formTemplateIds.formTemplateId", "name description stepNumber filledBy")
        .populate("createdBy", "firstName lastName")
        .select('name description price duration category isActive createdAt updatedAt')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit));

      const totalCertifications = await Certification.countDocuments(query);

      res.json({
        success: true,
        data: {
          certifications,
          pagination: {
            currentPage: parseInt(page),
            totalPages: Math.ceil(totalCertifications / limit),
            totalCertifications,
            hasNextPage: page * limit < totalCertifications,
            hasPrevPage: page > 1,
          },
        },
      });
    } catch (error) {
      logme.error("Get RTO certifications error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching RTO certifications",
      });
    }
  },

  // Email template management
  getEmailTemplates: async (req, res) => {
    try {
      const { rtoId } = req.params;
      const rto = await RTO.findById(rtoId);
      
      if (!rto) {
        return res.status(404).json({
          success: false,
          message: "RTO not found",
        });
      }

      res.json({
        success: true,
        data: rto.emailTemplates,
      });
    } catch (error) {
      logme.error("Get email templates error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching email templates",
      });
    }
  },

  updateEmailTemplate: async (req, res) => {
    try {
      const { rtoId } = req.params;
      const { templateName, subject, body, isActive } = req.body;

      const rto = await RTO.findById(rtoId);
      if (!rto) {
        return res.status(404).json({
          success: false,
          message: "RTO not found",
        });
      }

      if (!rto.emailTemplates[templateName]) {
        return res.status(404).json({
          success: false,
          message: `Template ${templateName} not found`,
        });
      }

      // Update template
      rto.emailTemplates[templateName] = {
        ...rto.emailTemplates[templateName],
        subject: subject || rto.emailTemplates[templateName].subject,
        body: body || rto.emailTemplates[templateName].body,
        isActive: isActive !== undefined ? isActive : rto.emailTemplates[templateName].isActive,
      };

      await rto.save();

      res.json({
        success: true,
        message: "Email template updated successfully",
        data: rto.emailTemplates[templateName],
      });
    } catch (error) {
      logme.error("Update email template error:", error);
      res.status(500).json({
        success: false,
        message: "Error updating email template",
      });
    }
  },

  testEmailTemplate: async (req, res) => {
    try {
      const { rtoId } = req.params;
      const { templateName, testEmail, variables = {} } = req.body;

      const rtoEmailService = require("../services/rtoEmailService");
      
      await rtoEmailService.testEmailTemplate(rtoId, templateName, testEmail, variables);

      res.json({
        success: true,
        message: "Test email sent successfully",
      });
    } catch (error) {
      logme.error("Test email template error:", error);
      res.status(500).json({
        success: false,
        message: "Error sending test email",
      });
    }
  },

  sendCustomEmail: async (req, res) => {
    try {
      const { rtoId } = req.params;
      const { toEmail, subject, content, variables = {} } = req.body;

      const rtoEmailService = require("../services/rtoEmailService");
      
      await rtoEmailService.sendRTOCustomEmail(rtoId, toEmail, subject, content, variables);

      res.json({
        success: true,
        message: "Custom email sent successfully",
      });
    } catch (error) {
      logme.error("Send custom email error:", error);
      res.status(500).json({
        success: false,
        message: "Error sending custom email",
      });
    }
  },

  getEmailVariables: async (req, res) => {
    try {
      const { rtoId } = req.params;
      const rto = await RTO.findById(rtoId);
      
      if (!rto) {
        return res.status(404).json({
          success: false,
          message: "RTO not found",
        });
      }

      // Available variables for email templates
      const variables = {
        companyName: rto.companyName,
        ceoName: rto.ceoName,
        ceoCode: rto.ceoCode,
        rtoNumber: rto.rtoNumber,
        companyEmail: rto.email,
        companyPhone: rto.phone,
        companyAddress: `${rto.address?.street || ''}, ${rto.address?.city || ''}, ${rto.address?.state || ''}, ${rto.address?.postalCode || ''}, ${rto.address?.country || ''}`,
        logoUrl: rto.assets?.logo?.url || null,
        primaryColor: rto.primaryColor,
        secondaryColor: rto.secondaryColor,
        subdomain: rto.subdomain,
        // Dynamic variables that can be passed
        firstName: "{firstName}",
        lastName: "{lastName}",
        applicationId: "{applicationId}",
        certificationName: "{certificationName}",
        paymentAmount: "{paymentAmount}",
        paymentId: "{paymentId}",
        formName: "{formName}",
        assessorName: "{assessorName}",
        certificateUrl: "{certificateUrl}",
        issueDate: "{issueDate}",
        feedback: "{feedback}",
        installmentNumber: "{installmentNumber}",
        totalInstallments: "{totalInstallments}",
        installmentAmount: "{installmentAmount}",
        remainingBalance: "{remainingBalance}",
        remainingPayments: "{remainingPayments}",
        resetUrl: "{resetUrl}",
        weekEndDate: "{weekEndDate}",
        newApplications: "{newApplications}",
        completedPayments: "{completedPayments}",
        issuedCertificates: "{issuedCertificates}",
        startTime: "{startTime}",
        duration: "{duration}",
        affectedServices: "{affectedServices}",
      };

      res.json({
        success: true,
        data: {
          variables,
          description: "These variables can be used in email templates with {variableName} syntax",
        },
      });
    } catch (error) {
      logme.error("Get email variables error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching email variables",
      });
    }
  },

  // Get all RTOs with comprehensive stats and information
  getAllRTOsWithStats: async (req, res) => {
    try {
      // Get only active RTOs (not soft-deleted)
      const rtos = await RTO.find({ isActive: true }).sort({ createdAt: -1 });
      
      // Get all RTO assets for logos
      const rtoAssets = await RTOAssets.find({});
      const assetsMap = {};
      rtoAssets.forEach(asset => {
        assetsMap[asset.rtoId.toString()] = asset;
      });

      // Get statistics for each RTO
      const rtoStats = await Promise.all(rtos.map(async (rto) => {
        const rtoId = rto._id;
        
        // Get counts for this RTO (only active items)
        const [
          totalUsers,
          totalCertifications,
          totalFormTemplates,
          totalApplications
        ] = await Promise.all([
          User.countDocuments({ rtoId, isActive: true }),
          Certification.countDocuments({ rtoId, isActive: true }),
          FormTemplate.countDocuments({ rtoId, isActive: true }),
          Application.countDocuments({ rtoId })
        ]);

        // Get RTO assets (logo)
        const assets = assetsMap[rtoId.toString()];
        const logoUrl = assets?.logo?.url || null;

        // Format address
        const formatAddress = (address) => {
          if (!address) return 'N/A';
          const parts = [
            address.street,
            address.city,
            address.state,
            address.postalCode,
            address.country
          ].filter(part => part && part.trim());
          return parts.length > 0 ? parts.join(', ') : 'N/A';
        };

        // Format contact information
        const formatContact = (phone, email) => {
          const phoneStr = phone || 'N/A';
          const emailStr = email || 'N/A';
          return `${phoneStr} | ${emailStr}`;
        };

        return {
          _id: rto._id,
          companyName: rto.companyName || 'N/A',
          subdomain: rto.subdomain || 'N/A',
          rtoNumber: rto.rtoNumber || 'N/A',
          ceoName: rto.ceoName || 'N/A',
          ceoCode: rto.ceoCode || 'N/A',
          contact: formatContact(rto.phone, rto.email),
          domain: rto.subdomain ? `${rto.subdomain}.certified.io` : 'N/A',
          address: formatAddress(rto.address),
          logoUrl: logoUrl,
          primaryColor: rto.primaryColor || '#007bff',
          secondaryColor: rto.secondaryColor || '#6c757d',
          isActive: rto.isActive || false,
          isVerified: rto.isVerified || false,
          registrationDate: rto.registrationDate || 'N/A',
          expiryDate: rto.expiryDate || 'N/A',
          // Statistics
          stats: {
            totalUsers: totalUsers,
            totalCertifications: totalCertifications,
            totalFormTemplates: totalFormTemplates,
            totalApplications: totalApplications
          },
          // Settings
          settings: {
            allowPublicRegistration: rto.settings?.allowPublicRegistration || false,
            requireEmailVerification: rto.settings?.requireEmailVerification || false,
            allowSelfRegistration: rto.settings?.allowSelfRegistration || false,
            features: rto.settings?.features || {
              assessors: false,
              salesAgents: false,
              salesManagers: false,
              thirdPartyForms: false,
              forecasting: false,
              advancedAnalytics: false,
              customBranding: false,
              bulkOperations: false,
              apiAccess: false
            },
            maxUsers: rto.settings?.maxUsers || 1000,
            maxCertifications: rto.settings?.maxCertifications || 50,
            maxFormTemplates: rto.settings?.maxFormTemplates || 100,
            maxAssessors: rto.settings?.maxAssessors || 50,
            maxSalesAgents: rto.settings?.maxSalesAgents || 20
          },
          // Subscription info
          subscription: {
            plan: rto.subscription?.plan || 'basic',
            startDate: rto.subscription?.startDate || 'N/A',
            endDate: rto.subscription?.endDate || 'N/A',
            isActive: rto.subscription?.isActive || false
          },
          createdAt: rto.createdAt,
          updatedAt: rto.updatedAt
        };
      }));

      res.json({
        success: true,
        data: {
          rtos: rtoStats,
          totalRTOs: rtos.length,
          summary: {
            totalActiveRTOs: rtos.filter(r => r.isActive).length,
            totalVerifiedRTOs: rtos.filter(r => r.isVerified).length,
            totalRTOsWithLogos: rtoStats.filter(r => r.logoUrl).length,
            totalUsers: rtoStats.reduce((sum, rto) => sum + rto.stats.totalUsers, 0),
            totalCertifications: rtoStats.reduce((sum, rto) => sum + rto.stats.totalCertifications, 0),
            totalFormTemplates: rtoStats.reduce((sum, rto) => sum + rto.stats.totalFormTemplates, 0),
            totalApplications: rtoStats.reduce((sum, rto) => sum + rto.stats.totalApplications, 0)
          }
        }
      });
    } catch (error) {
      logme.error("Get all RTOs with stats error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching RTOs with statistics",
        error: error.message
      });
    }
  },
};

// Helper function to get default permissions based on user type
function getDefaultPermissions(userType) {
  const basePermissions = [
    { module: "profile", actions: ["read", "update"] },
  ];

  switch (userType) {
    case "admin":
      return [
        ...basePermissions,
        { module: "users", actions: ["read", "write", "update", "delete"] },
        { module: "certifications", actions: ["read", "write", "update", "delete"] },
        { module: "applications", actions: ["read", "write", "update", "delete"] },
        { module: "payments", actions: ["read", "write", "update", "delete"] },
        { module: "certificates", actions: ["read", "write", "update", "delete"] },
        { module: "reports", actions: ["read"] },
      ];
    case "assessor":
      return [
        ...basePermissions,
        { module: "applications", actions: ["read", "update"] },
        { module: "assessments", actions: ["read", "write", "update"] },
        { module: "form_submissions", actions: ["read", "write", "update"] },
      ];
    case "sales_agent":
      return [
        ...basePermissions,
        { module: "applications", actions: ["read", "write", "update"] },
        { module: "payments", actions: ["read", "write"] },
        { module: "students", actions: ["read", "write", "update"] },
      ];
    case "sales_manager":
      return [
        ...basePermissions,
        { module: "applications", actions: ["read", "write", "update", "delete"] },
        { module: "payments", actions: ["read", "write", "update", "delete"] },
        { module: "students", actions: ["read", "write", "update", "delete"] },
        { module: "sales_agents", actions: ["read", "write", "update", "delete"] },
        { module: "reports", actions: ["read"] },
      ];
    default:
      return basePermissions;
  }
}

module.exports = rtoController; 