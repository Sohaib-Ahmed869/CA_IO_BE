// controllers/formTemplateController.js
const FormTemplate = require("../models/formTemplate");
const { logMe } = require("../utils/logger");
const { getRtoContext } = require("../utils/rtoContextUtils");

const formTemplateController = {
  // Create a new form template
  createFormTemplate: async (req, res) => {
    try {
      const { name, description, stepNumber, filledBy, formStructure, templateType, rtoId } =
        req.body;

      // Get RTO context from request (set by middleware)
      let finalRtoId = req.rtoConfig?._id;
      
      // If no RTO context from middleware, try to resolve from rtoId in body
      if (!finalRtoId && rtoId) {
        const RTO = require("../models/rto");
        // Check if rtoId is a code or ObjectId
        if (typeof rtoId === 'string' && rtoId.length <= 10) {
          // Likely an RTO code, find the RTO
          const rto = await RTO.findByCode(rtoId);
          if (rto) {
            finalRtoId = rto._id;
          } else {
            return res.status(400).json({
              success: false,
              message: `RTO with code '${rtoId}' not found`
            });
          }
        } else {
          // Assume it's an ObjectId
          finalRtoId = rtoId;
        }
      }

      const formTemplate = new FormTemplate({
        name,
        description,
        stepNumber,
        filledBy,
        formStructure,
        templateType: templateType || "custom",
        rtoId: finalRtoId, // Will be null for backward compatibility
      });

      await formTemplate.save();

      logMe("form_template.created", {
        formTemplateId: formTemplate._id,
        name: formTemplate.name,
        rtoId: finalRtoId,
        createdBy: req.user?.id
      });

      res.status(201).json({
        success: true,
        message: "Form template created successfully",
        data: formTemplate,
      });
    } catch (error) {
      logMe("form_template.create.error", error, "error");
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
      // Get RTO context from request (set by middleware)
      const rtoId = req.rtoConfig?._id || req.query.rtoId;
      
      // Build query - if RTO context exists, filter by RTO, otherwise get all
      const query = { isActive: true };
      const rtoContext = getRtoContext(req);
      
      // If admin access, don't filter by RTO (show all data)
      if (!rtoContext.isAdminAccess && rtoId) {
        query.rtoId = rtoId;
      }

      const formTemplates = await FormTemplate.find(query).populate('rtoId', 'name rtoCode');

      res.status(200).json({
        success: true,
        data: formTemplates,
        rtoContext: rtoId ? { rtoId } : null,
      });
    } catch (error) {
      logMe("form_template.get_all.error", error, "error");
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
      const formTemplate = await FormTemplate.findById(req.params.id).populate('rtoId', 'name rtoCode');
      
      if (!formTemplate) {
        return res.status(404).json({
          success: false,
          message: "Form template not found",
        });
      }

      // Check RTO context if provided
      const rtoId = req.rtoConfig?._id;
      if (rtoId && formTemplate.rtoId && formTemplate.rtoId._id.toString() !== rtoId.toString()) {
        return res.status(403).json({
          success: false,
          message: "Form template does not belong to the current RTO context",
        });
      }

      res.status(200).json({
        success: true,
        data: formTemplate,
      });
    } catch (error) {
      logMe("form_template.get_by_id.error", error, "error");
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
      const existingTemplate = await FormTemplate.findById(req.params.id);
      
      if (!existingTemplate) {
        return res.status(404).json({
          success: false,
          message: "Form template not found",
        });
      }

      // Check RTO context if provided
      const rtoId = req.rtoConfig?._id;
      if (rtoId && existingTemplate.rtoId && existingTemplate.rtoId.toString() !== rtoId.toString()) {
        return res.status(403).json({
          success: false,
          message: "Form template does not belong to the current RTO context",
        });
      }

      // Don't allow changing RTO context once set
      const updateData = { ...req.body };
      if (existingTemplate.rtoId) {
        delete updateData.rtoId;
      }

      const formTemplate = await FormTemplate.findByIdAndUpdate(
        req.params.id,
        updateData,
        { new: true, runValidators: true }
      );

      logMe("form_template.updated", {
        formTemplateId: formTemplate._id,
        name: formTemplate.name,
        rtoId: rtoId,
        updatedBy: req.user?.id
      });

      res.status(200).json({
        success: true,
        message: "Form template updated successfully",
        data: formTemplate,
      });
    } catch (error) {
      logMe("form_template.update.error", error, "error");
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
