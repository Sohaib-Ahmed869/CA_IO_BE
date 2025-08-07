// controllers/formTemplateController.js
const FormTemplate = require("../models/formTemplate");
const { rtoFilter } = require("../middleware/tenant");
const logme = require("../utils/logger");

const formTemplateController = {
  // Create a new form template
  createFormTemplate: async (req, res) => {
    try {
      const { name, description, stepNumber, filledBy, formStructure, rtoId } =
        req.body;

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

      const formTemplate = new FormTemplate({
        name,
        description,
        stepNumber,
        filledBy,
        formStructure,
        rtoId: rtoId, // Always use rtoId from request body if provided
        createdBy: req.user._id, // Add creator
      });

      await formTemplate.save();

      res.status(201).json({
        success: true,
        message: "Form template created successfully",
        data: formTemplate,
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: "Error creating form template",
        error: error.message,
      });
    }
  },

  // Get all form templates (RTO-specific + backward compatible)
  getAllFormTemplates: async (req, res) => {
    try {
      const query = { isActive: true, ...rtoFilter(req.rtoId) };
      const formTemplates = await FormTemplate.find(query);

      logme.debug('Form templates fetched', { count: formTemplates.length, rtoId: req.rtoId });

      res.status(200).json({
        success: true,
        data: formTemplates,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Error fetching form templates",
        error: error.message,
      });
    }
  },

  // Get form template by ID (RTO-specific + backward compatible)
  getFormTemplateById: async (req, res) => {
    try {
      const formTemplate = await FormTemplate.findOne({
        _id: req.params.id,
        ...rtoFilter(req.rtoId) // Ensure RTO access
      });
      
      if (!formTemplate) {
        return res.status(404).json({
          success: false,
          message: "Form template not found",
        });
      }

      res.status(200).json({
        success: true,
        data: formTemplate,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Error fetching form template",
        error: error.message,
      });
    }
  },

  // Update form template (RTO-specific)
  updateFormTemplate: async (req, res) => {
    try {
      const formTemplate = await FormTemplate.findOneAndUpdate(
        {
          _id: req.params.id,
          ...rtoFilter(req.rtoId) // Ensure RTO access
        },
        req.body,
        { new: true, runValidators: true }
      );

      if (!formTemplate) {
        return res.status(404).json({
          success: false,
          message: "Form template not found",
        });
      }

      res.status(200).json({
        success: true,
        message: "Form template updated successfully",
        data: formTemplate,
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: "Error updating form template",
        error: error.message,
      });
    }
  },

  // Delete form template (RTO-specific)
  deleteFormTemplate: async (req, res) => {
    try {
      const formTemplate = await FormTemplate.findOneAndUpdate(
        {
          _id: req.params.id,
          ...rtoFilter(req.rtoId) // Ensure RTO access
        },
        { 
          isActive: false,
          deletedAt: new Date()
        },
        { new: true }
      );

      if (!formTemplate) {
        return res.status(404).json({
          success: false,
          message: "Form template not found",
        });
      }

      res.status(200).json({
        success: true,
        message: "Form template soft deleted successfully",
        data: {
          formTemplateId: formTemplate._id,
          name: formTemplate.name,
          deletedAt: formTemplate.deletedAt
        }
      });
    } catch (error) {
      logme.error("Delete form template error:", error);
      res.status(500).json({
        success: false,
        message: "Error deleting form template",
        error: error.message,
      });
    }
  },

  // Restore soft-deleted form template
  restoreFormTemplate: async (req, res) => {
    try {
      const formTemplate = await FormTemplate.findOneAndUpdate(
        {
          _id: req.params.id,
          ...rtoFilter(req.rtoId) // Ensure RTO access
        },
        { 
          isActive: true,
          deletedAt: null
        },
        { new: true }
      );

      if (!formTemplate) {
        return res.status(404).json({
          success: false,
          message: "Form template not found",
        });
      }

      res.status(200).json({
        success: true,
        message: "Form template restored successfully",
        data: {
          formTemplateId: formTemplate._id,
          name: formTemplate.name,
          isActive: formTemplate.isActive
        }
      });
    } catch (error) {
      logme.error("Restore form template error:", error);
      res.status(500).json({
        success: false,
        message: "Error restoring form template",
        error: error.message,
      });
    }
  },
};

module.exports = formTemplateController;
