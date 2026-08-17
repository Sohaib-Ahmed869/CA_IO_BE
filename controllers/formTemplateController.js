// controllers/formTemplateController.js
const FormTemplate = require("../models/formTemplate");
const Certification = require("../models/certification");

// Certifications own the form association (certification.formTemplateIds), so
// to show "which qualification uses this form" we invert that into a
// templateId -> [{ _id, name }] map.
const buildTemplateCertificationMap = async () => {
  const certifications = await Certification.find({ isActive: true })
    .select("name formTemplateIds.formTemplateId")
    .lean();

  const map = {};
  for (const cert of certifications) {
    for (const entry of cert.formTemplateIds || []) {
      const templateId = entry?.formTemplateId?.toString();
      if (!templateId) continue;
      if (!map[templateId]) map[templateId] = [];
      // A cert can reference the same template at multiple steps — list it once.
      if (!map[templateId].some((c) => c._id === cert._id.toString())) {
        map[templateId].push({ _id: cert._id.toString(), name: cert.name });
      }
    }
  }
  return map;
};

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
      const [formTemplates, certMap] = await Promise.all([
        FormTemplate.find({ isActive: true }).lean(),
        buildTemplateCertificationMap(),
      ]);

      res.status(200).json({
        success: true,
        data: formTemplates.map((template) => ({
          ...template,
          certifications: certMap[template._id.toString()] || [],
        })),
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
      const formTemplate = await FormTemplate.findById(req.params.id).lean();

      if (!formTemplate) {
        return res.status(404).json({
          success: false,
          message: "Form template not found",
        });
      }

      const certifications = await Certification.find({
        isActive: true,
        "formTemplateIds.formTemplateId": formTemplate._id,
      })
        .select("name")
        .lean();

      res.status(200).json({
        success: true,
        data: {
          ...formTemplate,
          certifications: certifications.map((c) => ({
            _id: c._id.toString(),
            name: c.name,
          })),
        },
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
