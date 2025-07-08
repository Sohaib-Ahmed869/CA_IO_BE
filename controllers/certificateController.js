// controllers/certificationController.js
const Certification = require("../models/certification");
const FormTemplate = require("../models/formTemplate");

const certificationController = {
  // Create a new certification
  createCertification: async (req, res) => {
    try {
      const { name, price, description, formTemplateIds } = req.body;

      const certification = new Certification({
        name,
        price,
        description,
        formTemplateIds,
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

  // Get all certifications
  getAllCertifications: async (req, res) => {
    try {
      const certifications = await Certification.find({
        isActive: true,
      }).populate("formTemplateIds.formTemplateId");

      res.status(200).json({
        success: true,
        data: certifications,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Error fetching certifications",
        error: error.message,
      });
    }
  },

  // Get certification by ID
  getCertificationById: async (req, res) => {
    try {
      const certification = await Certification.findById(
        req.params.id
      ).populate("formTemplateIds.formTemplateId");

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

  // Update certification
  updateCertification: async (req, res) => {
    try {
      const certification = await Certification.findByIdAndUpdate(
        req.params.id,
        req.body,
        { new: true, runValidators: true }
      );

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
      res.status(400).json({
        success: false,
        message: "Error updating certification",
        error: error.message,
      });
    }
  },

  // Delete certification (soft delete)
  deleteCertification: async (req, res) => {
    try {
      const certification = await Certification.findByIdAndUpdate(
        req.params.id,
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
};

module.exports = certificationController;
