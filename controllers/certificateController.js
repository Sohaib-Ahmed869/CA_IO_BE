// controllers/certificationController.js
const mongoose = require("mongoose");
const Certification = require("../models/certification");
const FormTemplate = require("../models/formTemplate");

const certificationController = {
  // Create a new certification
  createCertification: async (req, res) => {
    try {
    const { name, price, description, formTemplateIds, docs } = req.body;

      const certification = new Certification({
        name,
        price,
        description,
        formTemplateIds,
        docs: docs || [],
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

  updateCertificationCompetencies: async (req, res) => {
    try {
      const { id } = req.params;
      const { competencyUnits, docs } = req.body;

      const certification = await Certification.findByIdAndUpdate(
        id,
        { competencyUnits: competencyUnits || [], ...(docs ? { docs } : {}) },
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
        message: "Certification competency units updated successfully",
        data: certification,
      });
    } catch (error) {
      console.error("Update certification competencies error:", error);
      res.status(500).json({
        success: false,
        message: "Error updating certification competencies",
        error: error.message,
      });
    }
  },

  // Get all certifications
  getAllCertifications: async (req, res) => {
    try {
      // Get all active certifications with required fields
      const certifications = await Certification.find({
        isActive: true,
        name: { $exists: true, $ne: null, $ne: "" }, // Ensure name exists and is not empty
      })
        .select("_id name description price isActive formTemplateIds competencyUnits createdAt updatedAt")
        .populate("formTemplateIds.formTemplateId", "name description")
        .sort({ name: 1 }); // Sort alphabetically by name

      // Filter out any certifications that might have missing critical fields after populate
      const validCertifications = certifications.filter(cert => {
        return cert && 
               cert._id && 
               cert.name && 
               typeof cert.name === 'string' && 
               cert.name.trim().length > 0 &&
               (cert.price === null || cert.price === undefined || typeof cert.price === 'number');
      });

      // Log for debugging if no certifications found
      if (validCertifications.length === 0) {
        console.warn("[getAllCertifications] No active certifications found. Check if any certifications have isActive: true");
      }

      res.status(200).json({
        success: true,
        data: validCertifications,
        count: validCertifications.length,
      });
    } catch (error) {
      console.error("Get all certifications error:", error);
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

      // Check if this is CPP20218 certification and if user is authenticated
      const isCPP20218 = certification._id.toString() === '68b80373c716839c3e29e117';
      
      if (isCPP20218 && req.user) {
        // Apply international student filtering for CPP20218
        const User = require('../models/user');
        const user = await User.findById(req.user._id);
        
        if (user) {
          const EnrolmentFormSelector = require('../utils/enrolmentFormSelector');
          
          // Get the correct enrolment form details
          const enrolmentFormDetails = await EnrolmentFormSelector.getEnrolmentFormDetails(
            certification._id,
            user.international_student
          );

          // Filter out existing enrolment forms and add the correct one
          const filteredFormTemplates = certification.formTemplateIds.filter(
            formTemplate => !formTemplate.formTemplateId.name.toLowerCase().includes('enrolment')
          );

          // Get the correct enrolment form template
          const FormTemplate = require('../models/formTemplate');
          const correctEnrolmentFormTemplate = await FormTemplate.findById(enrolmentFormDetails.formId);

          // Add the correct enrolment form at the beginning (step 1)
          const correctEnrolmentForm = {
            stepNumber: 1,
            formTemplateId: {
              _id: enrolmentFormDetails.formId,
              name: correctEnrolmentFormTemplate.name
            },
            filledBy: "user",
            title: `${enrolmentFormDetails.studentType} Enrolment Form`,
            _id: `enrolment_${enrolmentFormDetails.studentType.toLowerCase()}`
          };

          // Combine the correct enrolment form with other forms
          const allFormTemplates = [correctEnrolmentForm, ...filteredFormTemplates];

          // Create a modified certification object
          const modifiedCertification = {
            ...certification.toObject(),
            formTemplateIds: allFormTemplates
          };

          return res.status(200).json({
            success: true,
            data: modifiedCertification,
          });
        }
      }

      // For other certifications or unauthenticated users, return original data
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

  // Get all certifications with form template IDs only (optimized for speed)
  getAllCertificationFormTemplateIds: async (req, res) => {
    try {
      // Use lean() for faster query - returns plain JS objects instead of Mongoose documents
      const certifications = await Certification.find({
        isActive: true,
        name: { $exists: true, $ne: null, $ne: "" },
      })
        .select("_id name formTemplateIds")
        .lean() // Critical for performance - skips Mongoose document overhead
        .sort({ name: 1 }); // Sort alphabetically

      // Map all certifications to include only form template IDs
      const certificationsWithFormIds = certifications.map(cert => ({
        certificationId: cert._id,
        certificationName: cert.name,
        formTemplateIds: (cert.formTemplateIds || []).map(item => ({
          stepNumber: item.stepNumber,
          formTemplateId: item.formTemplateId,
          filledBy: item.filledBy,
          title: item.title,
        })),
        formTemplateCount: (cert.formTemplateIds || []).length,
      }));

      res.status(200).json({
        success: true,
        data: certificationsWithFormIds,
        count: certificationsWithFormIds.length,
      });
    } catch (error) {
      console.error("Get all certification form template IDs error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching certifications form template IDs",
        error: error.message,
      });
    }
  },

  // Get single certification form template IDs only (optimized for speed)
  getCertificationFormTemplateIds: async (req, res) => {
    try {
      const { id } = req.params;

      // Validate ID format early to avoid unnecessary DB query
      if (!id || !mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid certification ID",
        });
      }

      // Use lean() for faster query - returns plain JS objects instead of Mongoose documents
      const certification = await Certification.findById(id)
        .select("_id name formTemplateIds")
        .lean(); // Critical for performance - skips Mongoose document overhead

      if (!certification) {
        return res.status(404).json({
          success: false,
          message: "Certification not found",
        });
      }

      // Extract only form template IDs with their metadata (fast array map)
      const formTemplateIds = (certification.formTemplateIds || []).map(item => ({
        stepNumber: item.stepNumber,
        formTemplateId: item.formTemplateId,
        filledBy: item.filledBy,
        title: item.title,
      }));

      res.status(200).json({
        success: true,
        data: {
          certificationId: certification._id,
          certificationName: certification.name,
          formTemplateIds: formTemplateIds,
          count: formTemplateIds.length,
        },
      });
    } catch (error) {
      console.error("Get certification form template IDs error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching certification form template IDs",
        error: error.message,
      });
    }
  },
};

module.exports = certificationController;
