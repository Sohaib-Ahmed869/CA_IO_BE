// controllers/rtoController.js
const RTO = require("../models/rto");
const User = require("../models/user");
const { uploadToS3, deleteFromS3 } = require("../config/s3Config");

const rtoController = {
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

      // Get existing RTO
      const rto = await RTO.findById(rtoId);
      if (!rto) {
        return res.status(404).json({
          success: false,
          message: "RTO not found",
        });
      }

      // Save logo info
      rto.assets = rto.assets || {};
      rto.assets.logo = {
        url: file.location,
        key: file.key,
        uploadedAt: new Date(),
      };
      await rto.save();

      res.json({
        success: true,
        message: "Logo uploaded successfully",
        data: { logo: rto.assets.logo },
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
      const { title, type } = req.body;
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

      // Get existing RTO
      const rto = await RTO.findById(rtoId);
      if (!rto) {
        return res.status(404).json({
          success: false,
          message: "RTO not found",
        });
      }

      // Ensure assets and documents array exist
      if (!rto.assets) {
        rto.assets = {};
      }
      if (!Array.isArray(rto.assets.documents)) {
        rto.assets.documents = [];
      }

      // Create new document object
      const newDocument = {
        title: title,
        type: type,
        url: file.location,
        key: file.key,
        uploadedAt: new Date(),
        isActive: true,
      };

      // Add to documents array
      rto.assets.documents.push(newDocument);
      
      // Save the RTO
      await rto.save();

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
      const rto = await RTO.findById(rtoId).select("assets");

      if (!rto) {
        return res.status(404).json({
          success: false,
          message: "RTO not found",
        });
      }

      res.json({
        success: true,
        data: rto.assets || { logo: null, documents: [] },
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

      const rto = await RTO.findById(rtoId);
      if (!rto) {
        return res.status(404).json({
          success: false,
          message: "RTO not found",
        });
      }

      // Find document
      const documentIndex = rto.assets?.documents?.findIndex(
        (doc) => doc._id.toString() === documentId
      );

      if (documentIndex === -1 || documentIndex === undefined) {
        return res.status(404).json({
          success: false,
          message: "Document not found",
        });
      }

      const document = rto.assets.documents[documentIndex];

      // Delete from S3
      try {
        await deleteFromS3(document.key);
      } catch (error) {
        console.error("Error deleting from S3:", error);
      }

      // Remove from RTO
      rto.assets.documents.splice(documentIndex, 1);
      await rto.save();

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
      const { isActive } = req.body;

      const rto = await RTO.findById(rtoId);
      if (!rto) {
        return res.status(404).json({
          success: false,
          message: "RTO not found",
        });
      }

      const document = rto.assets?.documents?.find(
        (doc) => doc._id.toString() === documentId
      );

      if (!document) {
        return res.status(404).json({
          success: false,
          message: "Document not found",
        });
      }

      document.isActive = isActive;
      await rto.save();

      res.json({
        success: true,
        message: "Document status updated successfully",
        data: document,
      });
    } catch (error) {
      console.error("Update document status error:", error);
      res.status(500).json({
        success: false,
        message: "Error updating document status",
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