// controllers/formTemplateController.js
const FormTemplate = require("../models/formTemplate");

const formTemplateController = {
  // Create a new form template
  createFormTemplate: async (req, res) => {
    try {
      const { name, description, stepNumber, filledBy, formStructure } =
        req.body;

      const formTemplate = new FormTemplate({
        name,
        description,
        stepNumber,
        filledBy,
        formStructure,
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

  // Get all form templates
  getAllFormTemplates: async (req, res) => {
    try {
      const formTemplates = await FormTemplate.find({ isActive: true });

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

  // Get form template by ID
  getFormTemplateById: async (req, res) => {
    try {
      const formTemplate = await FormTemplate.findById(req.params.id);
      
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

  // Update form template
  updateFormTemplate: async (req, res) => {
    try {
      const formTemplate = await FormTemplate.findByIdAndUpdate(
        req.params.id,
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

  // Delete form template (soft delete)
  deleteFormTemplate: async (req, res) => {
    try {
      const formTemplate = await FormTemplate.findByIdAndUpdate(
        req.params.id,
        { isActive: false },
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
        message: "Form template deleted successfully",
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Error deleting form template",
        error: error.message,
      });
    }
  },
};

module.exports = formTemplateController;
