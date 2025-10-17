// controllers/certificationController.js
const Certification = require("../models/certification");
const FormTemplate = require("../models/formTemplate");
const { logMe } = require("../utils/logger");
const { getRtoContext } = require("../utils/rtoContextUtils");

const certificationController = {
  // Create a new certification
  createCertification: async (req, res) => {
    try {
      const { name, price, description, formTemplateIds, certificationType, rtoId } = req.body;

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

      const certification = new Certification({
        name,
        price,
        description,
        formTemplateIds,
        certificationType: certificationType || "custom",
        rtoId: finalRtoId, // Will be null for backward compatibility
      });

      await certification.save();

      logMe("certification.created", {
        certificationId: certification._id,
        name: certification.name,
        rtoId: finalRtoId,
        createdBy: req.user?.id
      });

      res.status(201).json({
        success: true,
        message: "Certification created successfully",
        data: certification,
      });
    } catch (error) {
      logMe("certification.create.error", error, "error");
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
      const { competencyUnits } = req.body;

      const certification = await Certification.findByIdAndUpdate(
        id,
        { competencyUnits: competencyUnits || [] },
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
      // Get RTO context from request (set by middleware)
      const rtoId = req.rtoConfig?._id || req.query.rtoId;
      
      // Build query - if RTO context exists, filter by RTO, otherwise get all
      const query = { isActive: true };
      const rtoContext = getRtoContext(req);
      
      // If admin access, don't filter by RTO (show all data)
      if (!rtoContext.isAdminAccess && rtoId) {
        query.rtoId = rtoId;
      }

      const certifications = await Certification.find(query)
        .populate("formTemplateIds.formTemplateId")
        .populate('rtoId', 'name rtoCode');

      res.status(200).json({
        success: true,
        data: certifications,
        rtoContext: rtoId ? { rtoId } : null,
      });
    } catch (error) {
      logMe("certification.get_all.error", error, "error");
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
      // Get RTO context from request (set by middleware)
      const rtoId = req.rtoConfig?._id;
      
      // Build query - if RTO context exists, filter by RTO, otherwise get any
      const query = { _id: req.params.id };
      const rtoContext = getRtoContext(req);
      
      // If admin access, don't filter by RTO (show all data)
      if (!rtoContext.isAdminAccess && rtoId) {
        query.rtoId = rtoId;
      }
      
      const certification = await Certification.findOne(query).populate("formTemplateIds.formTemplateId");

      if (!certification) {
        return res.status(404).json({
          success: false,
          message: "Certification not found or does not belong to current RTO",
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
      const { name, price, description, formTemplateIds, certificationType, rtoId, competencyUnits } = req.body;

      // Handle RTO ID resolution (same logic as createCertification)
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
          // Assume it's an ObjectId, validate it exists
          try {
            const rto = await RTO.findById(rtoId);
            if (rto) {
              finalRtoId = rtoId;
            } else {
              return res.status(400).json({
                success: false,
                message: `RTO with ID '${rtoId}' not found`
              });
            }
          } catch (error) {
            return res.status(400).json({
              success: false,
              message: `Invalid RTO ID format: '${rtoId}'`
            });
          }
        }
      } else if (!finalRtoId) {
        // Fallback to RTO context from middleware
        finalRtoId = req.rtoConfig?._id;
        
        // If middleware provided RTO context but RTO doesn't exist in database
        if (req.rtoConfig && req.rtoConfig.exists === false) {
          return res.status(400).json({
            success: false,
            message: `RTO with code '${req.rtoConfig.rtoCode}' not found in database`,
            error: "RTO_NOT_FOUND"
          });
        }
      }

      // Prepare update data
      const updateData = {};
      if (name !== undefined) updateData.name = name;
      if (price !== undefined) updateData.price = price;
      if (description !== undefined) updateData.description = description;
      if (formTemplateIds !== undefined) updateData.formTemplateIds = formTemplateIds;
      if (certificationType !== undefined) updateData.certificationType = certificationType;
      if (competencyUnits !== undefined) updateData.competencyUnits = competencyUnits;
      if (finalRtoId !== undefined) updateData.rtoId = finalRtoId;

      const certification = await Certification.findByIdAndUpdate(
        req.params.id,
        updateData,
        { new: true, runValidators: true }
      );

      if (!certification) {
        return res.status(404).json({
          success: false,
          message: "Certification not found",
        });
      }

      logMe("certification.updated", {
        certificationId: certification._id,
        name: certification.name,
        rtoId: finalRtoId,
        rtoIdSource: rtoId ? 'request_body' : (req.rtoConfig ? 'middleware_context' : 'none'),
        updatedBy: req.user?.id
      });

      res.status(200).json({
        success: true,
        message: "Certification updated successfully",
        data: certification,
      });
    } catch (error) {
      logMe("certification.update.error", {
        certificationId: req.params.id,
        error: error.message,
      }, "error");
      res.status(500).json({
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
};

module.exports = certificationController;
