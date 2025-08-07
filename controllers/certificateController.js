// controllers/certificationController.js
const mongoose = require("mongoose");
const Certification = require("../models/certification");
const logme = require("../utils/logger");
const FormTemplate = require("../models/formTemplate");
const { rtoFilter } = require("../middleware/tenant");

const certificationController = {
  // Create a new certification
  createCertification: async (req, res) => {
    try {
      const { name, price, description, formTemplateIds, rtoId, competencyUnits } = req.body;

      // Validate RTO exists and is active if rtoId is provided
      if (rtoId) {
        const RTO = require("../models/rto");
        const rto = await RTO.findOne({ _id: rtoId, isActive: true });
        if (!rto) {
          return res.status(400).json({
            success: false,
            message: "RTO not found or inactive",
          });
        }
      }

      // Handle formTemplateIds - convert array of strings to proper format
      let processedFormTemplateIds = [];
      if (formTemplateIds && Array.isArray(formTemplateIds)) {
        processedFormTemplateIds = formTemplateIds.map((templateId, index) => {
          // If it's already an object, use it as is
          if (typeof templateId === 'object' && templateId.formTemplateId) {
            return templateId;
          }
          // If it's a string, convert to object format
          return {
            stepNumber: index + 1,
            formTemplateId: templateId,
            filledBy: "user", // default value
            title: `Step ${index + 1}`
          };
        });
      }

      const certification = new Certification({
        name,
        price,
        description,
        formTemplateIds: processedFormTemplateIds,
        competencyUnits: competencyUnits || [], // Add competency units
        rtoId: rtoId, // Always use rtoId from request body if provided
        createdBy: req.user._id, // Add creator
      });

      await certification.save();

      res.status(201).json({
        success: true,
        message: "Certification created successfully",
        data: certification,
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: "Error creating certification",
        error: error.message,
      });
    }
  },

  // Get all certifications (RTO-specific + backward compatible)
  getAllCertifications: async (req, res) => {
    try {
      const { page = 1, limit = 10, search, status, category, sortBy = "createdAt", sortOrder = "desc" } = req.query;
      const { rtoFilter, rtoFilterWithLegacy } = require("../middleware/tenant");

      // Build query - use rtoFilterWithLegacy to include legacy data when no RTO is identified
      const query = req.rtoId ? rtoFilter(req.rtoId) : rtoFilterWithLegacy(req.rtoId);

      // By default, only show active certifications unless status is explicitly specified
      if (status) {
        query.isActive = status === "active";
      } else {
        query.isActive = true; // Default to active only
      }

      if (search) {
        query.$or = [
          { name: { $regex: search, $options: "i" } },
          { description: { $regex: search, $options: "i" } },
        ];
      }

      if (category) {
        query.category = category;
      }

      // Build sort object
      const sortObject = {};
      sortObject[sortBy] = sortOrder === "desc" ? -1 : 1;

      // Execute query with pagination
      const certifications = await Certification.find(query)
        .populate("createdBy", "firstName lastName")
        .limit(limit * 1)
        .skip((page - 1) * limit)
        .sort(sortObject);

      // Get total count
      const total = await Certification.countDocuments(query);

      res.json({
        success: true,
        data: {
          certifications,
          pagination: {
            current: parseInt(page),
            pages: Math.ceil(total / limit),
            total,
          },
        },
      });
    } catch (error) {
      logme.error("Get all certifications error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching certifications",
      });
    }
  },

  // Get certification by ID (RTO-specific + backward compatible)
  getCertificationById: async (req, res) => {
    try {
      const { rtoFilterWithLegacy } = require("../middleware/tenant");
      
      // Validate ObjectId format
      if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        logme.warn("Invalid ObjectId format", { certificationId: req.params.id });
        return res.status(400).json({
          success: false,
          message: "Invalid certification ID format",
        });
      }
      
      logme.info("Get certification by ID called", {
        certificationId: req.params.id,
        rtoId: req.rtoId,
        userType: req.user?.userType
      });
      
      // For admin operations, be more permissive with RTO filtering
      let query = { _id: req.params.id };
      
      // If RTO context is available, use it for filtering
      if (req.rtoId) {
        const legacyFilter = rtoFilterWithLegacy(req.rtoId);
        query = {
          _id: req.params.id,
          ...legacyFilter
        };
        logme.info("Applied RTO filter", { 
          rtoId: req.rtoId, 
          legacyFilter: legacyFilter,
          finalQuery: query
        });
      } else {
        logme.info("No RTO context, using basic query", { query: query });
      }
      
      // First try to find without any RTO filtering to see if it exists
      const allCertifications = await Certification.find({ _id: req.params.id });
      logme.info("All certifications with this ID", { 
        count: allCertifications.length,
        certifications: allCertifications.map(c => ({ 
          id: c._id, 
          name: c.name, 
          rtoId: c.rtoId 
        }))
      });
      
      const certification = await Certification.findOne(query)
        .populate("formTemplateIds.formTemplateId")
        .populate("createdBy", "firstName lastName");

      if (!certification) {
        logme.warn("Certification not found with filter", { 
          certificationId: req.params.id, 
          rtoId: req.rtoId,
          query: query
        });
        return res.status(404).json({
          success: false,
          message: "Certification not found",
        });
      }

      logme.info("Certification found", { 
        certificationId: certification._id,
        name: certification.name,
        rtoId: certification.rtoId
      });

      res.status(200).json({
        success: true,
        data: certification,
      });
    } catch (error) {
      logme.error("Get certification by ID error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching certification",
        error: error.message,
      });
    }
  },

  // Debug endpoint to test RTO filtering
  debugRTOCertification: async (req, res) => {
    try {
      const { certificationId } = req.params;
      const { rtoFilterWithLegacy, rtoFilter } = require("../middleware/tenant");
      
      logme.info("Debug RTO certification", {
        certificationId,
        rtoId: req.rtoId,
        userType: req.user?.userType
      });

      // Test different queries
      const basicQuery = { _id: certificationId };
      const rtoFilterQuery = req.rtoId ? { _id: certificationId, ...rtoFilter(req.rtoId) } : basicQuery;
      const legacyFilterQuery = req.rtoId ? { _id: certificationId, ...rtoFilterWithLegacy(req.rtoId) } : basicQuery;

      const [basicResult, rtoFilterResult, legacyFilterResult] = await Promise.all([
        Certification.findOne(basicQuery),
        Certification.findOne(rtoFilterQuery),
        Certification.findOne(legacyFilterQuery)
      ]);

      res.json({
        success: true,
        data: {
          certificationId,
          rtoId: req.rtoId,
          queries: {
            basic: basicQuery,
            rtoFilter: rtoFilterQuery,
            legacyFilter: legacyFilterQuery
          },
          results: {
            basic: basicResult ? { id: basicResult._id, name: basicResult.name, rtoId: basicResult.rtoId } : null,
            rtoFilter: rtoFilterResult ? { id: rtoFilterResult._id, name: rtoFilterResult.name, rtoId: rtoFilterResult.rtoId } : null,
            legacyFilter: legacyFilterResult ? { id: legacyFilterResult._id, name: legacyFilterResult.name, rtoId: legacyFilterResult.rtoId } : null
          }
        }
      });
    } catch (error) {
      logme.error("Debug RTO certification error:", error);
      res.status(500).json({
        success: false,
        message: "Error debugging RTO certification",
        error: error.message
      });
    }
  },

  // Update certification (RTO-specific with legacy support)
  updateCertification: async (req, res) => {
    try {
      const { certificationId } = req.params;
      const { rtoFilterWithLegacy } = require("../middleware/tenant");

      // Process formTemplateIds if provided
      let updateData = { ...req.body };
      if (updateData.formTemplateIds && Array.isArray(updateData.formTemplateIds)) {
        updateData.formTemplateIds = updateData.formTemplateIds.map((templateId, index) => {
          if (typeof templateId === 'object' && templateId.formTemplateId) {
            return templateId;
          }
          return {
            stepNumber: index + 1,
            formTemplateId: templateId,
            filledBy: "user", // default value
            title: `Step ${index + 1}`
          };
        });
      }

      // Build filter - be more permissive for admin operations
      let filter = { _id: certificationId };
      
      // If RTO context is available, use it for filtering
      if (req.rtoId) {
        filter = {
          _id: certificationId,
          ...rtoFilterWithLegacy(req.rtoId)
        };
      }

      const certification = await Certification.findOneAndUpdate(
        filter,
        updateData,
        { new: true, runValidators: true }
      );

      if (!certification) {
        logme.warn("Certification not found for update", { 
          certificationId, 
          rtoId: req.rtoId,
          filter: filter
        });
        return res.status(404).json({
          success: false,
          message: "Certification not found",
        });
      }

      logme.info("Certification updated successfully", { 
        certificationId: certification._id,
        name: certification.name
      });

      res.json({
        success: true,
        message: "Certification updated successfully",
        data: certification,
      });
    } catch (error) {
      logme.error("Update certification error:", error);
      res.status(500).json({
        success: false,
        message: "Error updating certification",
      });
    }
  },

  // Delete certification (RTO-specific with legacy support)
  deleteCertification: async (req, res) => {
    try {
      const { rtoFilterWithLegacy } = require("../middleware/tenant");
      
      // Build filter - be more permissive for admin operations
      let filter = { _id: req.params.id };
      
      // If RTO context is available, use it for filtering
      if (req.rtoId) {
        filter = {
          _id: req.params.id,
          ...rtoFilterWithLegacy(req.rtoId)
        };
      }
      
      const certification = await Certification.findOneAndUpdate(
        filter,
        { 
          isActive: false,
          deletedAt: new Date()
        },
        { new: true }
      );

      if (!certification) {
        logme.warn("Certification not found for deletion", { 
          certificationId: req.params.id, 
          rtoId: req.rtoId,
          filter: filter
        });
        return res.status(404).json({
          success: false,
          message: "Certification not found",
        });
      }

      logme.info("Certification deleted successfully", { 
        certificationId: certification._id,
        name: certification.name
      });

      res.status(200).json({
        success: true,
        message: "Certification soft deleted successfully",
        data: {
          certificationId: certification._id,
          name: certification.name,
          deletedAt: certification.deletedAt
        }
      });
    } catch (error) {
      logme.error("Delete certification error:", error);
      res.status(500).json({
        success: false,
        message: "Error deleting certification",
        error: error.message,
      });
    }
  },

  // Restore soft-deleted certification
  restoreCertification: async (req, res) => {
    try {
      const { rtoFilterWithLegacy } = require("../middleware/tenant");
      
      const certification = await Certification.findOneAndUpdate(
        {
          _id: req.params.id,
          ...rtoFilterWithLegacy(req.rtoId) // Allow access to legacy data for admin operations
        },
        { 
          isActive: true,
          deletedAt: null
        },
        { new: true }
      );

      if (!certification) {
        return res.status(404).json({
          success: false,
          message: "Certification not found",
        });
      }

      res.status(200).json({
        success: true,
        message: "Certification restored successfully",
        data: {
          certificationId: certification._id,
          name: certification.name,
          isActive: certification.isActive
        }
      });
    } catch (error) {
      logme.error("Restore certification error:", error);
      res.status(500).json({
        success: false,
        message: "Error restoring certification",
        error: error.message,
      });
    }
  },

  updateCertificationExpense: async (req, res) => {
    try {
      const { id } = req.params;
      const { baseExpense } = req.body;

      const certification = await Certification.findByIdAndUpdate(
        id,
        { baseExpense: baseExpense || 0 },
        { new: true, runValidators: true }
      );

      if (!certification) {
        return res.status(404).json({
          success: false,
          message: "Certification not found",
        });
      }

      res.json({
        success: true,
        message: "Certification base expense updated successfully",
        data: certification,
      });
    } catch (error) {
      logme.error("Update certification expense error:", error);
      res.status(500).json({
        success: false,
        message: "Error updating certification expense",
        error: error.message,
      });
    }
  },
};

module.exports = certificationController;
