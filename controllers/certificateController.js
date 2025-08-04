// controllers/certificationController.js
const Certification = require("../models/certification");
const FormTemplate = require("../models/formTemplate");
const { rtoFilter } = require("../middleware/tenant");

const certificationController = {
  // Create a new certification
  createCertification: async (req, res) => {
    try {
      const { name, price, description, formTemplateIds, rtoId, competencyUnits } = req.body;

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
        rtoId: rtoId || req.rtoId || null, // Use rtoId from body, fallback to middleware, then null
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
      console.log('Certifications request debug:', {
        rtoId: req.rtoId,
        rtoContext: req.rtoContext,
        hostname: req.hostname,
        headers: req.headers
      });
      
      // Use rtoFilter for backward compatibility
      const query = { isActive: true, ...rtoFilter(req.rtoId) };
      console.log('Certifications query:', query);
      
      const certifications = await Certification.find(query).populate("formTemplateIds.formTemplateId");

      res.status(200).json({
        success: true,
        data: certifications,
      });
    } catch (error) {
      console.error('Certifications error:', error);
      res.status(500).json({
        success: false,
        message: "Error fetching certifications",
        error: error.message,
      });
    }
  },

  // Get certification by ID (RTO-specific + backward compatible)
  getCertificationById: async (req, res) => {
    try {
      const { rtoFilterWithLegacy } = require("../middleware/tenant");
      
      const certification = await Certification.findOne({
        _id: req.params.id,
        ...rtoFilterWithLegacy(req.rtoId) // Allow access to legacy data for admin operations
      }).populate("formTemplateIds.formTemplateId");

      if (!certification) {
        return res.status(404).json({
          success: false,
          message: "Certification not found",
        });
      }

      res.status(200).json({
        success: true,
        data: certification,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Error fetching certification",
        error: error.message,
      });
    }
  },

  // Update certification (RTO-specific with legacy support)
  updateCertification: async (req, res) => {
    try {
      const { rtoFilterWithLegacy } = require("../middleware/tenant");
      
      console.log('Update certification debug:', {
        certificationId: req.params.id,
        rtoId: req.rtoId,
        rtoContext: req.rtoContext,
        userType: req.user.userType,
        userId: req.user._id,
        hostname: req.hostname
      });
      
      const filter = rtoFilterWithLegacy(req.rtoId);
      console.log('Filter applied:', filter);
      
      // For legacy system, try without RTO filter first
      let certification = await Certification.findOneAndUpdate(
        {
          _id: req.params.id,
          ...filter
        },
        req.body,
        { new: true, runValidators: true }
      );

      // If not found and no RTO context, try without any filter
      if (!certification && !req.rtoId) {
        console.log('Trying without RTO filter for legacy system');
        certification = await Certification.findOneAndUpdate(
          {
            _id: req.params.id
          },
          req.body,
          { new: true, runValidators: true }
        );
      }

      console.log('Certification found:', certification ? 'Yes' : 'No');

      if (!certification) {
        return res.status(404).json({
          success: false,
          message: "Certification not found",
        });
      }

      res.status(200).json({
        success: true,
        message: "Certification updated successfully",
        data: certification,
      });
    } catch (error) {
      console.error('Update certification error:', error);
      res.status(400).json({
        success: false,
        message: "Error updating certification",
        error: error.message,
      });
    }
  },

  // Delete certification (RTO-specific with legacy support)
  deleteCertification: async (req, res) => {
    try {
      const { rtoFilterWithLegacy } = require("../middleware/tenant");
      
      const certification = await Certification.findOneAndUpdate(
        {
          _id: req.params.id,
          ...rtoFilterWithLegacy(req.rtoId) // Allow access to legacy data for admin operations
        },
        { isActive: false },
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
        message: "Certification deleted successfully",
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Error deleting certification",
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
      console.error("Update certification expense error:", error);
      res.status(500).json({
        success: false,
        message: "Error updating certification expense",
        error: error.message,
      });
    }
  },
};

module.exports = certificationController;
