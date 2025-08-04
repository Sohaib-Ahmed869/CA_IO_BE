// controllers/rtoController.js
const RTO = require("../models/rto");
const User = require("../models/user");
const RTOAssets = require("../models/rtoAssets");
const { uploadToS3, deleteFromS3 } = require("../config/s3Config");

const rtoController = {
  // Test email with branding
  testEmailWithBranding: async (req, res) => {
    try {
      const { rtoId } = req.params;
      const { testEmail } = req.body;
      const emailService = require("../services/emailService2");
      
      console.log(`Testing email with RTO branding for ID: ${rtoId}`);
      
      if (!testEmail) {
        return res.status(400).json({
          success: false,
          message: "Test email address is required",
        });
      }
      
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
        },
      });
    } catch (error) {
      console.error("Test email error:", error);
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  },

  // Debug function to test RTO branding
  debugRTOBranding: async (req, res) => {
    try {
      const { rtoId } = req.params;
      const emailService = require("../services/emailService2");
      
      console.log(`Debugging RTO branding for ID: ${rtoId}`);
      
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
      console.error("Debug RTO branding error:", error);
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  },

  createRTO: async (req, res) => {
    try {
      console.log("Creating RTO with data:", req.body);
      
      // Validate required fields
      const requiredFields = ['companyName', 'ceoName', 'ceoCode', 'subdomain', 'email', 'phone', 'rtoNumber', 'registrationDate', 'expiryDate'];
      const missingFields = requiredFields.filter(field => !req.body[field]);
      
      if (missingFields.length > 0) {
        return res.status(400).json({ 
          success: false, 
          message: `Missing required fields: ${missingFields.join(', ')}` 
        });
      }

      const rto = new RTO({ ...req.body, createdBy: req.user._id });
      console.log("RTO object before save:", rto);
      
      await rto.save();
      console.log("RTO saved successfully:", rto._id);
      
      res.status(201).json({ success: true, data: rto });
    } catch (error) {
      console.error("RTO creation error:", error);
      res.status(400).json({ success: false, message: error.message });
    }
  },
  getAllRTOs: async (req, res) => {
    try {
      console.log("Fetching all RTOs...");
      const rtos = await RTO.find().sort({ createdAt: -1 });
      console.log("Found RTOs:", rtos.length);
      res.json({ success: true, data: rtos });
    } catch (error) {
      console.error("Get all RTOs error:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  },
  getRTOById: async (req, res) => {
    const rto = await RTO.findById(req.params.id);
    if (!rto) return res.status(404).json({ success: false, message: "Not found" });
    res.json({ success: true, data: rto });
  },
  updateRTO: async (req, res) => {
    const rto = await RTO.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!rto) return res.status(404).json({ success: false, message: "Not found" });
    res.json({ success: true, data: rto });
  },
  deleteRTO: async (req, res) => {
    const rto = await RTO.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
    if (!rto) return res.status(404).json({ success: false, message: "Not found" });
    res.json({ success: true, message: "Deleted" });
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

      // Check if RTO exists
      const rto = await RTO.findById(rtoId);
      if (!rto) {
        return res.status(404).json({
          success: false,
          message: "RTO not found",
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
          console.error("Error deleting old logo from S3:", error);
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
      console.error("Upload logo error:", error);
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

      // Check if RTO exists
      const rto = await RTO.findById(rtoId);
      if (!rto) {
        return res.status(404).json({
          success: false,
          message: "RTO not found",
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
      console.error("Upload document error:", error);
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
      console.error("Get assets error:", error);
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
        console.error("Error deleting from S3:", error);
      }

      // Remove from documents array
      rtoAssets.documents.splice(documentIndex, 1);
      await rtoAssets.save();

      res.json({
        success: true,
        message: "Document deleted successfully",
      });
    } catch (error) {
      console.error("Delete document error:", error);
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
      console.error("Update document error:", error);
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
        console.error("Error deleting logo from S3:", error);
      }

      // Remove logo
      rtoAssets.logo = null;
      await rtoAssets.save();

      res.json({
        success: true,
        message: "Logo deleted successfully",
      });
    } catch (error) {
      console.error("Delete logo error:", error);
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

      // Validate RTO exists
      const rto = await RTO.findById(rtoId);
      if (!rto) {
        return res.status(404).json({
          success: false,
          message: "RTO not found",
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
      console.error("Create RTO user error:", error);
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

      // Validate RTO exists
      const rto = await RTO.findById(rtoId);
      if (!rto) {
        return res.status(404).json({
          success: false,
          message: "RTO not found",
        });
      }

      // Build query
      let query = { rtoId: rtoId };
      
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
      console.error("Get RTO users error:", error);
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

      // Validate RTO exists
      const rto = await RTO.findById(rtoId);
      if (!rto) {
        return res.status(404).json({
          success: false,
          message: "RTO not found",
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
      console.error("Update RTO user error:", error);
      res.status(500).json({
        success: false,
        message: "Error updating RTO user",
      });
    }
  },

  deleteRTOUser: async (req, res) => {
    try {
      const { rtoId, userId } = req.params;

      // Validate RTO exists
      const rto = await RTO.findById(rtoId);
      if (!rto) {
        return res.status(404).json({
          success: false,
          message: "RTO not found",
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
      console.error("Delete RTO user error:", error);
      res.status(500).json({
        success: false,
        message: "Error deleting RTO user",
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
      console.error("Get RTO by subdomain error:", error);
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
      console.error("Get RTO logo error:", error);
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
      console.error("Get RTO logo by subdomain error:", error);
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
      console.error("Get RTO documents error:", error);
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
      console.error("Get RTO documents by subdomain error:", error);
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
      console.error("Get assets by subdomain error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching assets",
      });
    }
  },

  getRTOFormTemplates: async (req, res) => {
    try {
      const { rtoId } = req.params;
      
      // Check if RTO exists
      const rto = await RTO.findById(rtoId);
      if (!rto) {
        return res.status(404).json({
          success: false,
          message: "RTO not found",
        });
      }

      // Get form templates for this RTO
      const FormTemplate = require("../models/formTemplate");
      const formTemplates = await FormTemplate.find({ 
        rtoId: rtoId,
        isActive: true 
      }).select('name description stepNumber filledBy category isActive createdAt');

      res.json({
        success: true,
        data: formTemplates,
      });
    } catch (error) {
      console.error("Get RTO form templates error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching form templates",
      });
    }
  },

  getRTOCertificates: async (req, res) => {
    try {
      const { rtoId } = req.params;
      
      // Check if RTO exists
      const rto = await RTO.findById(rtoId);
      if (!rto) {
        return res.status(404).json({
          success: false,
          message: "RTO not found",
        });
      }

      // Get certificates for this RTO
      const Certification = require("../models/certification");
      const certificates = await Certification.find({ 
        rtoId: rtoId,
        isActive: true 
      }).select('name description price duration category isActive createdAt');

      res.json({
        success: true,
        data: certificates,
      });
    } catch (error) {
      console.error("Get RTO certificates error:", error);
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

      // Get form templates for this RTO
      const FormTemplate = require("../models/formTemplate");
      const formTemplates = await FormTemplate.find({ 
        rtoId: rto._id,
        isActive: true 
      }).select('name description stepNumber filledBy category isActive createdAt');

      res.json({
        success: true,
        data: formTemplates,
      });
    } catch (error) {
      console.error("Get RTO form templates by subdomain error:", error);
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
      console.error("Get RTO certificates by subdomain error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching certificates",
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
      console.error("Get email templates error:", error);
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
      console.error("Update email template error:", error);
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
      console.error("Test email template error:", error);
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
      console.error("Send custom email error:", error);
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
      console.error("Get email variables error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching email variables",
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